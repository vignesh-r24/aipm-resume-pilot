# AI PM Resume Helper

An AI-powered evaluation tool designed specifically to help aspiring and current Product Managers tailor their resumes to target job descriptions. By leveraging the advanced reasoning capabilities of Gemini models, this application analyzes your current resume against a specific role and provides comprehensive, actionable feedback.

## Features

- **Overall Match Score:** Instantly see your compatibility with the target role.
- **Strengths & Gaps Analysis:** Identifies what you are doing right and what critical skills or experiences are missing.
- **Best Practice Validation:** Flags common resume mistakes and formatting issues.
- **Actionable Rewrites:** Provides "Elite Rewrites" for weak bullet points based on industry best practices and expert reasoning.
- **Secure by Design:** Uses a full-stack architecture (Express + React) to keep your Gemini API keys securely on the server-side.

## Getting Started

To run this project locally, ensure you have Node.js installed, then follow these steps:

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables by copying `.env.example` to `.env` and adding your API key:
   ```bash
   cp .env.example .env
   # Add your GEMINI_API_KEY to the .env file
   ```
4. Start the full-stack development server:
   ```bash
   npm run dev
   ```
5. Open your browser to `http://localhost:3000` (or the port specified in your console).

## About the Creator

Created by **Vignesh Radhakrishnan**.

- [LinkedIn](https://www.linkedin.com/in/vignesh-radhakrishnan-)
- [GitHub](https://github.com/vignesh-r24)
