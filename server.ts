import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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

Think about your evaluation step-by-step before you respond.

You must return a JSON object that strictly follows this schema:
{
  "overall_fit_score": string (e.g. "85%"),
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

app.post('/api/evaluate', async (req, res) => {
  try {
    const { jobDescription, resume } = req.body;

    if (!jobDescription || !resume) {
      return res.status(400).json({ error: 'Job description and resume are required.' });
    }

    const prompt = EVALUATION_PROMPT_TEMPLATE
      .replace('{{job_description}}', jobDescription)
      .replace('{{resume}}', resume);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overall_fit_score: { type: Type.STRING },
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
          required: ["overall_fit_score", "strengths", "gaps", "violations", "actionable_suggestions"]
        }
      }
    });

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
        error: 'The requested model (gemini-3-flash-preview) was not found. This can happen if the API key project is not yet updated to the latest Gemini 3 series.' 
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

startServer();
