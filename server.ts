import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import multer from 'multer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    let parseFunc = pdf;
    
    // Check for ESM wrapping that could happen with loaders
    if (parseFunc && typeof parseFunc !== 'function') {
      if (typeof parseFunc.default === 'function') {
        parseFunc = parseFunc.default;
      } else if (parseFunc.default && typeof parseFunc.default.default === 'function') {
        parseFunc = parseFunc.default.default;
      }
    }

    if (typeof parseFunc !== 'function') {
      const keys = parseFunc ? Object.keys(parseFunc) : [];
      throw new Error(`pdf-parse resolution failed. Parsed type of pdf-parse is "${typeof parseFunc}". Available keys: ${JSON.stringify(keys)}`);
    }

    const data = await parseFunc(buffer);
    const fullText = data?.text;
    
    if (!fullText || !fullText.trim()) {
      throw new Error('The PDF appears to be empty or contains only images (OCR is not supported).');
    }
    return fullText;
  } catch (error: any) {
    console.error('pdf-parse Error:', error);
    throw new Error('Failed to extract text from PDF file. ' + (error.message || String(error)));
  }
}

dotenv.config();

admin.initializeApp({
  projectId: "gen-lang-client-0655152792"
});


const app = express();
const PORT = 3000;

// Trust the first proxy so rate-limiting works correctly behind Render's load balancer
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));

const verifyAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Please sign in to evaluate.' });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying auth token', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
};

// Simple file-backed persistent rate limiter with resilient in-memory fallback for read-only environments
let tempInMemoryLimits: any = {};
const LIMITS_FILE = path.join('/tmp', 'rate-limits.json');

const getLimitsData = () => {
  try {
    if (fs.existsSync(LIMITS_FILE)) {
      return JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn("Resilient Rate Limiter: Cannot read limits file, falling back to memory.", e);
  }
  return tempInMemoryLimits;
};

const saveLimitsData = (data: any) => {
  try {
    fs.writeFileSync(LIMITS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn("Resilient Rate Limiter: Cannot write limits file to disk, writing to memory instead.", e);
    tempInMemoryLimits = data;
  }
};

const getTodayStr = () => new Date().toISOString().split('T')[0];

const GLOBAL_LIMIT = 10;
const USER_LIMIT = 1;

interface RateLimitTracker {
  global: number;
  users: Record<string, number>;
}

const checkRateLimits = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  
  if (user && user.email) {
      const bypassEmailsStr = process.env.RATE_LIMIT_BYPASS_EMAILS || '';
      const bypassEmails = bypassEmailsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
      if (bypassEmails.includes(user.email.toLowerCase())) {
          return next();
      }
  }

  const today = getTodayStr();
  const data = getLimitsData();
  
  if (!data[today]) {
    data[today] = { global: 0, users: {} };
  }
  
  const todayData = data[today] as RateLimitTracker;
  const uid = (req as any).user?.uid || req.ip || 'unknown';

  if (todayData.global >= GLOBAL_LIMIT) {
    return res.status(429).json({ error: 'Global app limit reached: this application only processes 10 resumes per day to conserve API quota. Please come back tomorrow.' });
  }

  const userUsage = todayData.users[uid] || 0;
  if (userUsage >= USER_LIMIT) {
    return res.status(429).json({ error: 'Trial limit reached: You have used your 1 free evaluation. Please come back tomorrow or clone the project.' });
  }

  // Increment usage
  todayData.global += 1;
  todayData.users[uid] = userUsage + 1;
  
  // Prune old days to save space
  for (const dateStr of Object.keys(data)) {
    if (dateStr !== today) delete data[dateStr];
  }

  saveLimitsData(data);
  next();
};

app.get('/api/limits', (req, res) => {
  const today = getTodayStr();
  const data = getLimitsData();
  const todayData = data[today] || { global: 0 };
  const remaining = Math.max(0, GLOBAL_LIMIT - todayData.global);
  res.json({ remaining, limit: GLOBAL_LIMIT });
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const EVALUATION_PROMPT_TEMPLATE = `
You will be acting as an elite Executive Recruiter and Product Director specializing in AI Product Management. Your goal is to evaluate a candidate's resume against a specific Job Description (JD) and a set of strict industry best practices, providing actionable feedback to improve their chances.

You should maintain a professional, analytical, and brutally honest but constructive tone.

Here are the AI PM Resume Best Practices you must evaluate the candidate against:
<best_practices>
1. Brevity & Tailoring: The resume should be concise (ideally one page, two max) and specifically tailored to the PM role, making every word count rather than listing everything they have ever done.
2. Narrative & Hard Evidence: Does the candidate tell a compelling story? They should not just repeat the JD, but provide hard evidence of their claims. Look for specific proof points like links to product announcements, press articles, hackathon wins, patents, or speaking gigs.
3. Contextual Clarity: Does the candidate provide immediate context for unknown companies or non-traditional background transitions? Is the scale and scope of their impact clear (e.g., framing a launch or revenue metric so the reviewer understands its actual significance)?
4. Craft & Detail: The resume must show intentionality. It should be formatted well, easy to read, and have zero spelling mistakes or broken links.
5. Specificity Over Buzzwords: The candidate must avoid broad, vague claims (e.g., "Led the full lifecycle of an AI product" or "Results-driven leader"). They must name the specific product, its importance, and their exact, instrumental role in shipping it.
</best_practices>

Here is the target job description the candidate is applying for:
<job_description>
{{job_description}}
</job_description>

Here is the candidate's current resume:
<resume>
{{resume}}
</resume>

Here are the important rules for your analysis:
- Always compare the <resume> against the <job_description> strictly. Do not invent requirements that are not in the JD.
- Evaluate the <resume> against every single item in the <best_practices> document.
- Identify specific gaps where the candidate fails to meet the JD or the best practices.
- Provide actionable rewrite suggestions for specific bullet points, particularly focusing on adding evidence, links, and context.

Review the candidate's resume against the job description and best practices provided. How can the candidate improve their resume?
The overall match score should reflect a weighted combination of the four category sub-scores (brevity, narrative, craft, context) PLUS the overall job description fit analysis.

Think about your evaluation step-by-step before you respond.

You must return a JSON object that strictly follows this schema:
{
  "candidate_name": string (the extracted candidate's full name from their resume, or empty string if not found),
  "overall_fit_score": string (e.g. "85%"),
  "sub_scores": {
    "brevity": { "score": number (0-100), "reason": string },
    "narrative": { "score": number (0-100), "reason": string },
    "craft": { "score": number (0-100), "reason": string },
    "context": { "score": number (0-100), "reason": string }
  },
  "strengths": string[],
  "gaps": string[],
  "violations": string[],
  "actionable_suggestions": {
    "original": string,
    "suggestion": string,
    "reasoning": string
  }[]
}
`;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/parse-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    const text = await extractTextFromPDF(req.file.buffer);
    res.json({ text });
  } catch (error: any) {
    console.error('PDF Parse Error:', error);
    res.status(500).json({ error: 'Failed to parse PDF file. Details: ' + (error.message || String(error)) });
  }
});

app.post('/api/evaluate', verifyAuth, checkRateLimits, async (req, res) => {
  try {
    const { jobDescription, resume } = req.body;

    if (!jobDescription || !resume) {
      return res.status(400).json({ error: 'Job description and resume are required.' });
    }

    const prompt = EVALUATION_PROMPT_TEMPLATE
      .replace('{{job_description}}', jobDescription)
      .replace('{{resume}}', resume);

    const modelsToTry = ["gemini-3.5-flash", "gemini-1.5-flash"];
    let response: any = null;
    let evalError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Starting content generation with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                candidate_name: { type: Type.STRING },
                overall_fit_score: { type: Type.STRING },
                sub_scores: {
                  type: Type.OBJECT,
                  properties: {
                    brevity: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["score", "reason"] },
                    narrative: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["score", "reason"] },
                    craft: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["score", "reason"] },
                    context: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["score", "reason"] }
                  },
                  required: ["brevity", "narrative", "craft", "context"]
                },
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                violations: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionable_suggestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING },
                      suggestion: { type: Type.STRING },
                      reasoning: { type: Type.STRING }
                    },
                    required: ["original", "suggestion", "reasoning"]
                  }
                }
              },
              required: ["overall_fit_score", "sub_scores", "strengths", "gaps", "violations", "actionable_suggestions", "candidate_name"]
            }
          }
        });
        
        // Succeeded, break loop
        break;
      } catch (err: any) {
        console.warn(`Model ${modelName} failed. Error:`, err?.message || err);
        evalError = err;
      }
    }

    if (!response) {
      throw evalError || new Error("Failed to evaluate with any of the requested models.");
    }

    const result = JSON.parse(response.text || '{}');
    res.json(result);
  } catch (error: any) {
    console.error('Evaluation error:', error);
    
    const errorMessage = error?.message || '';
    const status = error?.status || 500;

    if (errorMessage.includes('RESOURCE_EXHAUSTED') || status === 429) {
      return res.status(429).json({ 
        error: 'The AI model is currently at capacity for this project\'s quota. As you are on an AI Pro subscription, please ensure you have selected a billing-enabled API key in the "Settings > Secrets" panel to unlock higher limits.' 
      });
    }

    if (errorMessage.includes('NOT_FOUND') || status === 404) {
      return res.status(404).json({ 
        error: 'The requested model (gemini-3-flash) was not found. This can happen if the API key project is not yet updated to the latest Gemini series.' 
      });
    }

    res.status(500).json({ 
      error: 'Evaluation failed: ' + (errorMessage.length > 150 ? errorMessage.substring(0, 150) + '...' : errorMessage)
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
