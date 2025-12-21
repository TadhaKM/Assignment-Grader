# Assignment Grading Tool

An AI-powered web application that uses Claude (Anthropic's AI) to automatically grade programming assignments and provide detailed, constructive feedback.

## Features

- **Automated Grading**: Submit student code and get comprehensive AI-powered evaluations
- **Customizable Rubrics**: Define your own marking schemes and criteria
- **Detailed Feedback**: Get specific, actionable feedback on what's right and what needs improvement
- **Expected Solutions**: Compare student code against model solutions
- **Output Validation**: Specify expected behavior and outputs for thorough evaluation
- **Clean Interface**: Simple, intuitive web interface for easy grading

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
ANTHROPIC_API_KEY=your_actual_api_key_here
PORT=3000
```

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
http://localhost:3000/grading.html
```

## How to Use

### Step 1: Define Your Marking Scheme

Enter your grading criteria, for example:

```
Total Points: 100

Functionality (40 points):
- Code runs without errors (20 pts)
- Meets all requirements (20 pts)

Code Quality (30 points):
- Clean, readable code (15 pts)
- Follows best practices (15 pts)

Documentation (20 points):
- Well-commented code (10 pts)
- Clear variable names (10 pts)

Testing (10 points):
- Includes test cases (10 pts)
```

### Step 2: Provide Expected Answer

Paste your model solution or describe what the correct implementation should include:

```javascript
function calculateAverage(numbers) {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
}
```

### Step 3: Submit Student Code

Paste the student's code submission:

```javascript
function calculateAverage(numbers) {
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i];
  }
  return sum / numbers.length;
}
```

### Step 4: (Optional) Specify Expected Output

Describe how the code should behave:

```
- calculateAverage([1, 2, 3, 4, 5]) should return 3
- calculateAverage([]) should return 0
- Should handle edge cases like empty arrays
```

### Step 5: Get Results

Click "Grade Assignment" and receive:
- A final grade (e.g., "85/100" or "B+")
- What the student did well
- What needs improvement
- Specific, actionable feedback

## API Endpoint

The grading functionality is also available as a REST API:

**POST** `/api/grade`

Request body:
```json
{
  "markingScheme": "Your marking scheme here...",
  "expectedAnswer": "Expected solution code...",
  "studentCode": "Student's submitted code...",
  "expectedOutput": "Optional: Expected behavior..."
}
```

Response:
```json
{
  "grade": "85/100",
  "feedback": "Detailed feedback text...",
  "success": true
}
```


## License

MIT
