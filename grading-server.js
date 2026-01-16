// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// SECURITY CONFIGURATION CONSTANTS
// =============================================================================

// Rate limiting configuration (OWASP: Protect against brute force/DoS)
const RATE_LIMIT_CONFIG = {
  // General API rate limit: 100 requests per 15 minutes per IP
  general: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.'
  },
  // Grading endpoint: More restrictive due to API cost (20 requests per 15 min)
  grading: {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many grading requests. Please wait before submitting again.'
  }
};

// Input validation limits (OWASP: Input Validation)
const INPUT_LIMITS = {
  // Text field maximum lengths (in characters)
  markingScheme: { min: 10, max: 10000 },
  expectedAnswer: { min: 10, max: 50000 },
  studentWork: { min: 1, max: 100000 },
  additionalContext: { min: 0, max: 5000 },
  // Image constraints
  maxImages: 5,
  maxImageSizeBytes: 10 * 1024 * 1024, // 10MB per image
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// Allowed values for enum fields (whitelist validation)
const ALLOWED_SUBJECTS = [
  'programming', 'mathematics', 'science', 'essay',
  'history', 'languages', 'art', 'business', 'other'
];

const ALLOWED_ASSESSMENT_TYPES = [
  'code', 'theory', 'problem', 'essay', 'lab', 'project', 'exam'
];

// =============================================================================
// SECURITY MIDDLEWARE SETUP
// =============================================================================

// Helmet: Sets various HTTP headers for security (OWASP: Security Headers)
// - X-Content-Type-Options: nosniff (prevents MIME sniffing)
// - X-Frame-Options: DENY (prevents clickjacking)
// - X-XSS-Protection: enabled (legacy XSS protection)
// - Strict-Transport-Security: enabled (enforces HTTPS)
// - Content-Security-Policy: restricts resource loading
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for the app
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"], // Allow data URIs for image previews
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // Disable for image handling compatibility
}));

// General rate limiter for all routes (OWASP: Denial of Service Prevention)
const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.general.windowMs,
  max: RATE_LIMIT_CONFIG.general.max,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  // Custom handler for graceful 429 response
  handler: (req, res) => {
    res.status(429).json({
      error: RATE_LIMIT_CONFIG.general.message,
      retryAfter: Math.ceil(RATE_LIMIT_CONFIG.general.windowMs / 1000),
      success: false
    });
  },
  // Use IP for identification (supports proxies via trust proxy)
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  }
});

// Stricter rate limiter for grading endpoint (expensive API calls)
const gradingLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.grading.windowMs,
  max: RATE_LIMIT_CONFIG.grading.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: RATE_LIMIT_CONFIG.grading.message,
      retryAfter: Math.ceil(RATE_LIMIT_CONFIG.grading.windowMs / 1000),
      success: false
    });
  },
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  }
});

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Trust proxy for accurate IP detection behind reverse proxies (OWASP: Logging)
app.set('trust proxy', 1);

// JSON body parser with size limit (OWASP: Input Validation - prevent large payloads)
// 20MB limit to accommodate base64 images while preventing abuse
app.use(express.json({
  limit: '20mb',
  // Reject requests with wrong content-type (OWASP: Input Validation)
  strict: true
}));

// Serve static files with security headers
app.use(express.static('public', {
  // Disable directory listing
  dotfiles: 'ignore',
  // Set cache headers
  maxAge: '1h'
}));

// =============================================================================
// INITIALIZE ANTHROPIC CLIENT (Secure API Key Handling)
// =============================================================================

// API key is loaded from environment variable only (OWASP: Sensitive Data Exposure)
// Never hardcode API keys or expose them client-side
let anthropic = null;

function initializeAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not configured');
    return null;
  }

  // Validate API key format (basic check - starts with expected prefix)
  if (!apiKey.startsWith('sk-ant-')) {
    console.warn('⚠️  ANTHROPIC_API_KEY appears to have invalid format');
    return null;
  }

  return new Anthropic({ apiKey });
}

anthropic = initializeAnthropicClient();

// =============================================================================
// INPUT VALIDATION SCHEMAS (OWASP: Input Validation)
// =============================================================================

// Validation middleware for grading endpoint
const gradeValidation = [
  // Subject: must be from allowed list or empty (defaults to 'other')
  body('subject')
    .optional()
    .isString()
    .trim()
    .isIn(ALLOWED_SUBJECTS)
    .withMessage(`Subject must be one of: ${ALLOWED_SUBJECTS.join(', ')}`),

  // Assessment type: must be from allowed list or empty (defaults to 'theory')
  body('assessmentType')
    .optional()
    .isString()
    .trim()
    .isIn(ALLOWED_ASSESSMENT_TYPES)
    .withMessage(`Assessment type must be one of: ${ALLOWED_ASSESSMENT_TYPES.join(', ')}`),

  // Marking scheme: required, string, length validated
  body('markingScheme')
    .exists({ checkFalsy: true })
    .withMessage('Marking scheme is required')
    .isString()
    .withMessage('Marking scheme must be a string')
    .trim()
    .isLength({ min: INPUT_LIMITS.markingScheme.min, max: INPUT_LIMITS.markingScheme.max })
    .withMessage(`Marking scheme must be between ${INPUT_LIMITS.markingScheme.min} and ${INPUT_LIMITS.markingScheme.max} characters`),

  // Expected answer: required, string, length validated
  body('expectedAnswer')
    .exists({ checkFalsy: true })
    .withMessage('Expected answer is required')
    .isString()
    .withMessage('Expected answer must be a string')
    .trim()
    .isLength({ min: INPUT_LIMITS.expectedAnswer.min, max: INPUT_LIMITS.expectedAnswer.max })
    .withMessage(`Expected answer must be between ${INPUT_LIMITS.expectedAnswer.min} and ${INPUT_LIMITS.expectedAnswer.max} characters`),

  // Student work: required, string, length validated
  body('studentWork')
    .exists({ checkFalsy: true })
    .withMessage('Student work is required')
    .isString()
    .withMessage('Student work must be a string')
    .trim()
    .isLength({ min: INPUT_LIMITS.studentWork.min, max: INPUT_LIMITS.studentWork.max })
    .withMessage(`Student work must be between ${INPUT_LIMITS.studentWork.min} and ${INPUT_LIMITS.studentWork.max} characters`),

  // Additional context: optional, string, length validated
  body('additionalContext')
    .optional({ nullable: true })
    .isString()
    .withMessage('Additional context must be a string')
    .trim()
    .isLength({ max: INPUT_LIMITS.additionalContext.max })
    .withMessage(`Additional context must be less than ${INPUT_LIMITS.additionalContext.max} characters`),

  // Images: optional array with strict validation
  body('images')
    .optional({ nullable: true })
    .isArray({ max: INPUT_LIMITS.maxImages })
    .withMessage(`Maximum ${INPUT_LIMITS.maxImages} images allowed`),

  // Validate each image in the array
  body('images.*.data')
    .optional()
    .isString()
    .withMessage('Image data must be a base64 string')
    .isBase64()
    .withMessage('Image data must be valid base64'),

  body('images.*.mediaType')
    .optional()
    .isString()
    .isIn(INPUT_LIMITS.allowedImageTypes)
    .withMessage(`Image type must be one of: ${INPUT_LIMITS.allowedImageTypes.join(', ')}`)
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sanitize error messages to prevent information leakage (OWASP: Error Handling)
 * Never expose internal error details, stack traces, or system information
 */
function sanitizeErrorMessage(error) {
  // Map known error types to safe messages
  const safeMessages = {
    'ECONNREFUSED': 'Service temporarily unavailable. Please try again later.',
    'ETIMEDOUT': 'Request timed out. Please try again.',
    'ENOTFOUND': 'Service temporarily unavailable. Please try again later.',
    'rate_limit_error': 'Service is busy. Please try again in a few moments.',
    '401': 'Service configuration error. Please contact administrator.',
    '403': 'Access denied. Please contact administrator.',
    '500': 'An internal error occurred. Please try again later.'
  };

  // Check for known error patterns
  if (error.code && safeMessages[error.code]) {
    return safeMessages[error.code];
  }

  if (error.status && safeMessages[error.status.toString()]) {
    return safeMessages[error.status.toString()];
  }

  if (error.type && safeMessages[error.type]) {
    return safeMessages[error.type];
  }

  // Default safe message - never expose actual error details
  return 'An error occurred while processing your request. Please try again.';
}

/**
 * Validate image data size and structure (OWASP: Input Validation)
 */
function validateImages(images) {
  if (!images || !Array.isArray(images)) {
    return { valid: true, images: [] };
  }

  const validatedImages = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // Check required fields exist
    if (!img || typeof img !== 'object') {
      return { valid: false, error: `Image ${i + 1}: Invalid image object` };
    }

    if (!img.data || !img.mediaType) {
      return { valid: false, error: `Image ${i + 1}: Missing required fields (data, mediaType)` };
    }

    // Validate media type (whitelist approach)
    if (!INPUT_LIMITS.allowedImageTypes.includes(img.mediaType)) {
      return { valid: false, error: `Image ${i + 1}: Invalid image type. Allowed: ${INPUT_LIMITS.allowedImageTypes.join(', ')}` };
    }

    // Validate base64 data size (approximate byte size = base64 length * 0.75)
    const approximateSize = (img.data.length * 3) / 4;
    if (approximateSize > INPUT_LIMITS.maxImageSizeBytes) {
      return { valid: false, error: `Image ${i + 1}: Exceeds maximum size of ${INPUT_LIMITS.maxImageSizeBytes / (1024 * 1024)}MB` };
    }

    // Basic base64 validation (check for valid characters)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(img.data)) {
      return { valid: false, error: `Image ${i + 1}: Invalid base64 encoding` };
    }

    validatedImages.push({
      data: img.data,
      mediaType: img.mediaType
    });
  }

  return { valid: true, images: validatedImages };
}

/**
 * Check for unexpected fields in request body (OWASP: Mass Assignment Prevention)
 */
function rejectUnexpectedFields(allowedFields) {
  return (req, res, next) => {
    const receivedFields = Object.keys(req.body);
    const unexpectedFields = receivedFields.filter(field => !allowedFields.includes(field));

    if (unexpectedFields.length > 0) {
      return res.status(400).json({
        error: `Unexpected fields in request: ${unexpectedFields.join(', ')}`,
        success: false
      });
    }

    next();
  };
}

// Allowed fields for grading endpoint
const ALLOWED_GRADE_FIELDS = [
  'subject', 'assessmentType', 'markingScheme', 'expectedAnswer',
  'studentWork', 'additionalContext', 'images'
];

// =============================================================================
// SUBJECT AND ASSESSMENT TYPE CONFIGURATIONS
// =============================================================================

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

// =============================================================================
// PROMPT BUILDER
// =============================================================================

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

// =============================================================================
// API ROUTES
// =============================================================================

// Redirect root to grading page
app.get('/', (req, res) => {
  res.redirect('/grading.html');
});

// Health check endpoint (public, rate limited by general limiter)
app.get('/api/health', (req, res) => {
  // Don't expose sensitive configuration details (OWASP: Information Exposure)
  res.json({
    status: 'ok',
    service: 'Assignment Grading Tool',
    apiConfigured: !!anthropic, // Boolean only, no key details
    availableSubjects: Object.keys(subjectPrompts).length,
    availableAssessmentTypes: Object.keys(assessmentTypes).length
  });
});

// Get available subjects and assessment types (public, rate limited by general limiter)
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

// Main grading endpoint with full security measures
app.post('/api/grade',
  // Apply stricter rate limit for this expensive endpoint
  gradingLimiter,
  // Reject unexpected fields (mass assignment protection)
  rejectUnexpectedFields(ALLOWED_GRADE_FIELDS),
  // Run validation middleware
  gradeValidation,
  // Handle request
  async (req, res) => {
    try {
      // Check for validation errors from express-validator
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Return first validation error with 400 status
        const firstError = errors.array()[0];
        return res.status(400).json({
          error: firstError.msg,
          field: firstError.path,
          success: false
        });
      }

      // Check if Anthropic client is initialized (OWASP: Fail Securely)
      if (!anthropic) {
        return res.status(503).json({
          error: 'Grading service is not configured. Please contact administrator.',
          success: false
        });
      }

      // Extract and sanitize validated inputs
      const {
        subject = 'other',
        assessmentType = 'theory',
        markingScheme,
        expectedAnswer,
        studentWork,
        additionalContext,
        images
      } = req.body;

      // Additional image validation (size and structure)
      const imageValidation = validateImages(images);
      if (!imageValidation.valid) {
        return res.status(400).json({
          error: imageValidation.error,
          success: false
        });
      }

      // Build the grading prompt
      const prompt = buildGradingPrompt({
        subject,
        assessmentType,
        markingScheme: markingScheme.trim(),
        expectedAnswer: expectedAnswer.trim(),
        studentWork: studentWork.trim(),
        additionalContext: additionalContext?.trim() || null,
        hasImages: imageValidation.images.length > 0
      });

      // Log request (sanitized - no sensitive data) for monitoring
      console.log(`[GRADE] Subject: ${subject}, Type: ${assessmentType}, Images: ${imageValidation.images.length}, IP: ${req.ip}`);

      // Build message content with optional images
      const messageContent = [];

      // Add validated images
      for (const img of imageValidation.images) {
        messageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.data
          }
        });
      }

      // Add text prompt
      messageContent.push({
        type: 'text',
        text: prompt
      });

      // Call Claude API with timeout
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

      console.log(`[GRADE] Completed successfully for IP: ${req.ip}`);

      res.json({
        grade,
        feedback,
        subject: subjectPrompts[subject]?.name || 'General',
        assessmentType: assessmentTypes[assessmentType]?.name || 'General Assessment',
        success: true
      });

    } catch (error) {
      // Log full error internally for debugging (OWASP: Logging)
      console.error(`[GRADE ERROR] IP: ${req.ip}, Error:`, error.message || error);

      // Return sanitized error message to client (OWASP: Error Handling)
      const safeMessage = sanitizeErrorMessage(error);

      // Determine appropriate status code
      let statusCode = 500;
      if (error.status === 401 || error.status === 403) {
        statusCode = 503; // Service unavailable (don't expose auth issues)
      } else if (error.type === 'rate_limit_error') {
        statusCode = 429;
      }

      res.status(statusCode).json({
        error: safeMessage,
        success: false
      });
    }
  }
);

// =============================================================================
// 404 HANDLER (OWASP: Information Exposure Prevention)
// =============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    success: false
  });
});

// =============================================================================
// GLOBAL ERROR HANDLER (OWASP: Error Handling)
// =============================================================================

app.use((err, req, res, next) => {
  // Log error internally
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);

  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON in request body',
      success: false
    });
  }

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request payload too large. Maximum size is 20MB.',
      success: false
    });
  }

  // Generic error response - never expose internal details
  res.status(500).json({
    error: 'An unexpected error occurred. Please try again.',
    success: false
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║         🎓 Assignment Grading Tool Server 🎓              ║
║              (Security Hardened Edition)                   ║
║                                                            ║
║  Server running on: http://localhost:${PORT}               ║
║  Grading interface: http://localhost:${PORT}/grading.html  ║
║                                                            ║
║  Security Features:                                        ║
║  • Rate Limiting (IP-based)                                ║
║  • Input Validation & Sanitization                         ║
║  • Security Headers (Helmet)                               ║
║  • Error Message Sanitization                              ║
║                                                            ║
║  API Key Status: ${anthropic ? '✅ Configured' : '❌ Not configured'}                        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  if (!anthropic) {
    console.log(`
⚠️  WARNING: ANTHROPIC_API_KEY is not set or invalid!

To use the grading tool:
1. Create a .env file in the project directory
2. Add your API key: ANTHROPIC_API_KEY=sk-ant-api03-...
3. Restart the server

Security Note: Never hardcode API keys in source code.
    `);
  }
});
