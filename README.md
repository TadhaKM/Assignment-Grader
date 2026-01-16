# Assignment Grading Tool

An AI-powered web application that uses Claude (Anthropic's AI) to automatically grade assignments across multiple subjects and provide detailed, constructive feedback.

## Features

- **Multi-Subject Support**: Grade assignments in Programming, Math, Science, Essay Writing, History, Languages, Art, Business, and more
- **Multiple Assessment Types**: Support for code, theory, problem-solving, essays, lab reports, projects, and exams
- **Image Upload**: Upload images of handwritten work, diagrams, or artwork for AI analysis
- **Customizable Rubrics**: Define your own marking schemes and criteria
- **Detailed Feedback**: Get specific, actionable feedback on strengths and areas for improvement
- **Security Hardened**: Rate limiting, input validation, and OWASP best practices

## Security Features

This application implements comprehensive security measures:

- **Rate Limiting**: IP-based rate limiting (100 req/15min general, 20 req/15min for grading)
- **Input Validation**: Schema-based validation with type checks and length limits
- **Security Headers**: Helmet.js for CSP, X-Frame-Options, HSTS, and more
- **Error Sanitization**: Safe error messages that don't leak internal details
- **API Key Protection**: Environment variables only, never exposed client-side

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Get Your Anthropic API Key

1. Visit [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
PORT=3000
```

**Security Note**: Never commit `.env` files or hardcode API keys in source code.

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 5. Access the Grading Tool

Open your browser and navigate to:

```
http://localhost:3000
```

## Supported Subjects

| Subject | Grading Focus |
|---------|---------------|
| Programming | Code correctness, quality, efficiency, error handling |
| Mathematics | Accuracy, problem-solving approach, notation, reasoning |
| Science | Scientific accuracy, concepts, formulas, terminology |
| Essay/Writing | Thesis, argument structure, evidence, grammar, style |
| History | Historical accuracy, analysis, sources, context |
| Languages | Grammar, vocabulary, sentence structure, communication |
| Art/Design | Technical skill, creativity, design principles |
| Business | Concepts, analysis, real-world application |

## Assessment Types

- **Code/Programming**: Evaluate code correctness, efficiency, and style
- **Theory/Conceptual**: Assess understanding of theoretical concepts
- **Problem Solving**: Evaluate methodology and final answers
- **Essay/Written**: Grade thesis, arguments, and writing quality
- **Lab Report**: Assess methodology, data, and conclusions
- **Project/Portfolio**: Evaluate overall quality and creativity
- **Exam/Test**: Grade accuracy and completeness

## How to Use

### Step 1: Select Subject & Assessment Type

Choose the appropriate subject area and assessment type for specialized grading criteria.

### Step 2: Define Your Marking Scheme

Enter your grading criteria with point values:

```
Total: 100 points

- Understanding of concepts (30 pts)
- Accuracy of answer (30 pts)
- Clarity of explanation (20 pts)
- Use of examples (10 pts)
- Presentation (10 pts)
```

### Step 3: Provide Expected Answer

Enter the model solution or key points that should be included.

### Step 4: Submit Student Work

Paste the student's submission. Optionally upload images (up to 5) of handwritten work, diagrams, or visual content.

### Step 5: Get Results

Click "Grade Assignment" to receive:
- A final grade based on your rubric
- Detailed feedback on strengths
- Areas for improvement with specific examples
- Constructive suggestions

## API Reference

### POST `/api/grade`

Grade an assignment programmatically.

**Request Body:**
```json
{
  "subject": "programming",
  "assessmentType": "code",
  "markingScheme": "Total: 100 points...",
  "expectedAnswer": "Model solution...",
  "studentWork": "Student's submission...",
  "additionalContext": "Optional extra instructions...",
  "images": [
    {
      "data": "base64-encoded-image-data",
      "mediaType": "image/jpeg"
    }
  ]
}
```

**Response:**
```json
{
  "grade": "85/100",
  "feedback": "Detailed feedback...",
  "subject": "Programming/Computer Science",
  "assessmentType": "Code/Programming Assignment",
  "success": true
}
```

**Rate Limits:**
- 20 requests per 15 minutes per IP

### GET `/api/options`

Get available subjects and assessment types.

### GET `/api/health`

Health check endpoint.

## Input Limits

| Field | Min | Max |
|-------|-----|-----|
| Marking Scheme | 10 chars | 10,000 chars |
| Expected Answer | 10 chars | 50,000 chars |
| Student Work | 1 char | 100,000 chars |
| Additional Context | - | 5,000 chars |
| Images | - | 5 images, 10MB each |

## Troubleshooting

### "Grading service is not configured"
Ensure `ANTHROPIC_API_KEY` is set in your `.env` file and restart the server.

### "Too many grading requests"
You've hit the rate limit. Wait 15 minutes or reduce request frequency.

### "Request payload too large"
Reduce the size of your submission or images. Maximum payload is 20MB.

## Cost Considerations

- Each grading request uses approximately 1,000-3,000 tokens
- Image analysis increases token usage
- Monitor usage at [console.anthropic.com](https://console.anthropic.com/)

## Privacy & Security

- Student submissions are sent to Anthropic's API for grading
- No data is stored on the server
- API keys are never exposed to the client
- All inputs are validated and sanitized
- Review [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy)

## License

MIT
