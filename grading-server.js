const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Redirect root to grading page
app.get('/', (req, res) => {
  res.redirect('/grading.html');
});

// Subject-specific grading prompts
const subjectPrompts = {
  programming: {
    name: 'Programming/Computer Science',
    systemContext: 'You are an expert programming instructor with deep knowledge of software development, algorithms, and best practices.',
    gradingFocus: [
      'Code correctness and functionality',
      'Code quality and readability',
      'Algorithm efficiency',
      'Error handling',
      'Best practices and conventions'
    ]
  },
  mathematics: {
    name: 'Mathematics',
    systemContext: 'You are an expert mathematics instructor with expertise in mathematical reasoning, problem-solving, and proof techniques.',
    gradingFocus: [
      'Mathematical accuracy',
      'Problem-solving approach',
      'Showing work and reasoning',
      'Use of correct notation',
      'Logical progression of steps'
    ]
  },
  science: {
    name: 'Science (Physics/Chemistry/Biology)',
    systemContext: 'You are an expert science instructor with knowledge across physics, chemistry, and biology.',
    gradingFocus: [
      'Scientific accuracy',
      'Understanding of concepts',
      'Application of formulas/principles',
      'Lab report structure (if applicable)',
      'Use of scientific terminology'
    ]
  },
  essay: {
    name: 'Essay/Writing',
    systemContext: 'You are an expert writing instructor with expertise in composition, rhetoric, and literary analysis.',
    gradingFocus: [
      'Thesis clarity and strength',
      'Argument structure and logic',
      'Evidence and support',
      'Grammar and mechanics',
      'Style and voice'
    ]
  },
  history: {
    name: 'History/Social Studies',
    systemContext: 'You are an expert history instructor with deep knowledge of historical events, analysis, and historiography.',
    gradingFocus: [
      'Historical accuracy',
      'Analysis and interpretation',
      'Use of primary/secondary sources',
      'Understanding of context',
      'Argumentation quality'
    ]
  },
  languages: {
    name: 'Foreign Languages',
    systemContext: 'You are an expert language instructor with expertise in grammar, vocabulary, and cultural context.',
    gradingFocus: [
      'Grammar accuracy',
      'Vocabulary usage',
      'Sentence structure',
      'Cultural appropriateness',
      'Communication effectiveness'
    ]
  },
  art: {
    name: 'Art/Design',
    systemContext: 'You are an expert art instructor with knowledge of visual arts, design principles, and artistic techniques.',
    gradingFocus: [
      'Technical skill',
      'Creativity and originality',
      'Use of design principles',
      'Concept execution',
      'Presentation quality'
    ]
  },
  business: {
    name: 'Business/Economics',
    systemContext: 'You are an expert business instructor with knowledge of economics, management, and business analysis.',
    gradingFocus: [
      'Understanding of concepts',
      'Analysis quality',
      'Application to real scenarios',
      'Use of business terminology',
      'Critical thinking'
    ]
  },
  other: {
    name: 'Other/General',
    systemContext: 'You are an expert instructor capable of evaluating student work across various disciplines.',
    gradingFocus: [
      'Understanding of material',
      'Quality of response',
      'Critical thinking',
      'Clarity of expression',
      'Completeness'
    ]
  }
};

// Assessment type configurations
const assessmentTypes = {
  code: {
    name: 'Code/Programming Assignment',
    instructions: 'Evaluate the code for correctness, efficiency, style, and adherence to requirements.'
  },
  theory: {
    name: 'Theory/Conceptual Questions',
    instructions: 'Evaluate the understanding of theoretical concepts, accuracy of explanations, and depth of knowledge.'
  },
  problem: {
    name: 'Problem Solving',
    instructions: 'Evaluate the problem-solving approach, methodology, work shown, and final answer accuracy.'
  },
  essay: {
    name: 'Essay/Written Response',
    instructions: 'Evaluate the thesis, argument structure, evidence, writing quality, and adherence to prompt.'
  },
  lab: {
    name: 'Lab Report/Practical',
    instructions: 'Evaluate the methodology, data collection, analysis, conclusions, and scientific writing.'
  },
  project: {
    name: 'Project/Portfolio',
    instructions: 'Evaluate the overall quality, creativity, execution, documentation, and learning demonstrated.'
  },
  exam: {
    name: 'Exam/Test Questions',
    instructions: 'Evaluate accuracy of answers, understanding demonstrated, and completeness of responses.'
  }
};

// Build grading prompt based on subject and assessment type
function buildGradingPrompt(data) {
  const { subject, assessmentType, markingScheme, expectedAnswer, studentWork, additionalContext, hasImages } = data;

  const subjectConfig = subjectPrompts[subject] || subjectPrompts.other;
  const assessmentConfig = assessmentTypes[assessmentType] || assessmentTypes.theory;

  let prompt = `${subjectConfig.systemContext}

You are tasked with grading a student's ${assessmentConfig.name.toLowerCase()} in ${subjectConfig.name}.

## Assessment Type
${assessmentConfig.name}: ${assessmentConfig.instructions}

## Key Grading Focus Areas for ${subjectConfig.name}:
${subjectConfig.gradingFocus.map(f => `- ${f}`).join('\n')}

## Marking Scheme/Rubric:
${markingScheme}

## Expected Answer/Model Solution:
${expectedAnswer}

## Student's Submission:
${studentWork}`;

  if (additionalContext) {
    prompt += `

## Additional Context/Requirements:
${additionalContext}`;
  }

  if (hasImages) {
    prompt += `

## Note on Images:
The student's submission includes images. Please analyze any images provided as part of the submission and incorporate your analysis into the grading.`;
  }

  prompt += `

## Grading Instructions:
Please provide a comprehensive evaluation by:

1. **Overall Assessment**: Start with a brief summary of the submission quality
2. **Strengths**: List what the student did well with specific examples
3. **Areas for Improvement**: Identify mistakes, gaps, or areas needing work with specific examples
4. **Detailed Feedback**: Provide constructive, actionable feedback for each grading criterion
5. **Final Grade**: Assign a clear grade based on the marking scheme (e.g., "Final Grade: 85/100" or "Grade: B+")

Be thorough, fair, encouraging, and constructive in your evaluation. Focus on helping the student learn and improve.`;

  return prompt;
}

// Assignment grading endpoint
app.post('/api/grade', async (req, res) => {
  try {
    const {
      subject,
      assessmentType,
      markingScheme,
      expectedAnswer,
      studentWork,
      additionalContext,
      images // Array of base64 encoded images
    } = req.body;

    // Validate required fields
    if (!markingScheme || !expectedAnswer || !studentWork) {
      return res.status(400).json({
        error: 'Missing required fields: markingScheme, expectedAnswer, and studentWork are required'
      });
    }

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY is not configured. Please set it in your environment variables.'
      });
    }

    // Build the grading prompt
    const prompt = buildGradingPrompt({
      subject: subject || 'other',
      assessmentType: assessmentType || 'theory',
      markingScheme,
      expectedAnswer,
      studentWork,
      additionalContext,
      hasImages: images && images.length > 0
    });

    console.log(`Grading ${assessmentTypes[assessmentType]?.name || 'assignment'} for ${subjectPrompts[subject]?.name || 'General'}...`);

    // Build message content with optional images
    const messageContent = [];

    // Add images if provided
    if (images && images.length > 0) {
      for (const img of images) {
        if (img.data && img.mediaType) {
          messageContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.data
            }
          });
        }
      }
    }

    // Add text prompt
    messageContent.push({
      type: 'text',
      text: prompt
    });

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: messageContent
      }]
    });

    // Extract the response text
    const feedback = message.content[0].text;

    // Extract the grade from the feedback
    const gradeMatch = feedback.match(/(?:Final\s+)?Grade:\s*([^\n]+)/i);
    const grade = gradeMatch ? gradeMatch[1].trim() : 'See feedback for details';

    console.log('Grading completed successfully');

    res.json({
      grade,
      feedback,
      subject: subjectPrompts[subject]?.name || 'General',
      assessmentType: assessmentTypes[assessmentType]?.name || 'General Assessment',
      success: true
    });

  } catch (error) {
    console.error('Error grading assignment:', error);

    // Handle API errors specifically
    if (error.status === 401) {
      return res.status(500).json({
        error: 'Invalid API key. Please check your ANTHROPIC_API_KEY.'
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to grade assignment. Please try again.'
    });
  }
});

// Get available subjects and assessment types
app.get('/api/options', (req, res) => {
  res.json({
    subjects: Object.entries(subjectPrompts).map(([key, value]) => ({
      id: key,
      name: value.name,
      gradingFocus: value.gradingFocus
    })),
    assessmentTypes: Object.entries(assessmentTypes).map(([key, value]) => ({
      id: key,
      name: value.name,
      instructions: value.instructions
    }))
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Assignment Grading Tool',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    availableSubjects: Object.keys(subjectPrompts).length,
    availableAssessmentTypes: Object.keys(assessmentTypes).length
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║         🎓 Assignment Grading Tool Server 🎓              ║
║                                                            ║
║  Server running on: http://localhost:${PORT}               ║
║  Grading interface: http://localhost:${PORT}/grading.html  ║
║                                                            ║
║  Features:                                                 ║
║  • ${Object.keys(subjectPrompts).length} Subject Areas                                   ║
║  • ${Object.keys(assessmentTypes).length} Assessment Types                                ║
║  • Image Upload Support                                    ║
║                                                            ║
║  API Key Status: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Not configured'}                        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`
⚠️  WARNING: ANTHROPIC_API_KEY is not set!

To use the grading tool:
1. Create a .env file in the project directory
2. Add your API key: ANTHROPIC_API_KEY=sk-ant-api03-...
3. Restart the server
    `);
  }
});
