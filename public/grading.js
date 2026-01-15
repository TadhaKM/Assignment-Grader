document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('gradingForm');
    const gradeButton = document.getElementById('gradeButton');
    const clearButton = document.getElementById('clearButton');
    const resultsDiv = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    const resultsMeta = document.getElementById('resultsMeta');
    const errorDiv = document.getElementById('error');
    const subjectSelect = document.getElementById('subject');
    const imageInput = document.getElementById('imageInput');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const gradingFocusInfo = document.getElementById('gradingFocusInfo');
    const gradingFocusList = document.getElementById('gradingFocusList');

    // Store uploaded images
    let uploadedImages = [];
    const MAX_IMAGES = 5;

    // Subject grading focus areas
    const subjectFocusAreas = {
        programming: [
            'Code correctness and functionality',
            'Code quality and readability',
            'Algorithm efficiency',
            'Error handling',
            'Best practices and conventions'
        ],
        mathematics: [
            'Mathematical accuracy',
            'Problem-solving approach',
            'Showing work and reasoning',
            'Use of correct notation',
            'Logical progression of steps'
        ],
        science: [
            'Scientific accuracy',
            'Understanding of concepts',
            'Application of formulas/principles',
            'Lab report structure (if applicable)',
            'Use of scientific terminology'
        ],
        essay: [
            'Thesis clarity and strength',
            'Argument structure and logic',
            'Evidence and support',
            'Grammar and mechanics',
            'Style and voice'
        ],
        history: [
            'Historical accuracy',
            'Analysis and interpretation',
            'Use of primary/secondary sources',
            'Understanding of context',
            'Argumentation quality'
        ],
        languages: [
            'Grammar accuracy',
            'Vocabulary usage',
            'Sentence structure',
            'Cultural appropriateness',
            'Communication effectiveness'
        ],
        art: [
            'Technical skill',
            'Creativity and originality',
            'Use of design principles',
            'Concept execution',
            'Presentation quality'
        ],
        business: [
            'Understanding of concepts',
            'Analysis quality',
            'Application to real scenarios',
            'Use of business terminology',
            'Critical thinking'
        ],
        other: [
            'Understanding of material',
            'Quality of response',
            'Critical thinking',
            'Clarity of expression',
            'Completeness'
        ]
    };

    // Show grading focus areas when subject changes
    subjectSelect.addEventListener('change', function() {
        const subject = this.value;
        if (subject && subjectFocusAreas[subject]) {
            gradingFocusList.innerHTML = subjectFocusAreas[subject]
                .map(focus => `<li>${focus}</li>`)
                .join('');
            gradingFocusInfo.style.display = 'block';
        } else {
            gradingFocusInfo.style.display = 'none';
        }
    });

    // Image upload handling
    imageUploadArea.addEventListener('click', function(e) {
        if (e.target === imageUploadArea || e.target === uploadPrompt || uploadPrompt.contains(e.target)) {
            imageInput.click();
        }
    });

    imageUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        imageUploadArea.classList.add('dragover');
    });

    imageUploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        imageUploadArea.classList.remove('dragover');
    });

    imageUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        imageUploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        handleImageFiles(files);
    });

    imageInput.addEventListener('change', function() {
        const files = Array.from(this.files);
        handleImageFiles(files);
        this.value = ''; // Reset input
    });

    function handleImageFiles(files) {
        const remainingSlots = MAX_IMAGES - uploadedImages.length;
        const filesToAdd = files.slice(0, remainingSlots);

        filesToAdd.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64 = e.target.result.split(',')[1];
                const mediaType = file.type;
                uploadedImages.push({
                    data: base64,
                    mediaType: mediaType,
                    name: file.name,
                    preview: e.target.result
                });
                updateImagePreviews();
            };
            reader.readAsDataURL(file);
        });

        if (files.length > remainingSlots) {
            showError(`Only ${MAX_IMAGES} images allowed. ${files.length - remainingSlots} image(s) were not added.`);
        }
    }

    function updateImagePreviews() {
        imagePreviewContainer.innerHTML = uploadedImages.map((img, index) => `
            <div class="image-preview">
                <img src="${img.preview}" alt="${img.name}">
                <button type="button" class="remove-image" data-index="${index}">&times;</button>
                <span class="image-name">${img.name}</span>
            </div>
        `).join('');

        // Update upload prompt visibility
        if (uploadedImages.length >= MAX_IMAGES) {
            uploadPrompt.style.display = 'none';
        } else {
            uploadPrompt.style.display = 'block';
        }

        // Add remove handlers
        document.querySelectorAll('.remove-image').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const index = parseInt(this.dataset.index);
                uploadedImages.splice(index, 1);
                updateImagePreviews();
            });
        });
    }

    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Get form values
        const subject = document.getElementById('subject').value;
        const assessmentType = document.getElementById('assessmentType').value;
        const markingScheme = document.getElementById('markingScheme').value.trim();
        const expectedAnswer = document.getElementById('expectedAnswer').value.trim();
        const studentWork = document.getElementById('studentWork').value.trim();
        const additionalContext = document.getElementById('additionalContext').value.trim();

        // Validate inputs
        if (!subject || !assessmentType) {
            showError('Please select both a subject and assessment type.');
            return;
        }

        if (!markingScheme || !expectedAnswer || !studentWork) {
            showError('Please fill in the marking scheme, expected answer, and student work.');
            return;
        }

        // Show loading state
        setLoadingState(true);
        hideError();
        hideResults();

        try {
            // Prepare images for API
            const images = uploadedImages.map(img => ({
                data: img.data,
                mediaType: img.mediaType
            }));

            // Send grading request to backend
            const response = await fetch('/api/grade', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subject,
                    assessmentType,
                    markingScheme,
                    expectedAnswer,
                    studentWork,
                    additionalContext: additionalContext || null,
                    images: images.length > 0 ? images : null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to grade assignment');
            }

            // Display results
            displayResults(data);
        } catch (error) {
            console.error('Grading error:', error);
            showError(error.message || 'An error occurred while grading the assignment. Please try again.');
        } finally {
            setLoadingState(false);
        }
    });

    // Handle clear button
    clearButton.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear the form?')) {
            form.reset();
            uploadedImages = [];
            updateImagePreviews();
            gradingFocusInfo.style.display = 'none';
            hideResults();
            hideError();
        }
    });

    function setLoadingState(loading) {
        gradeButton.disabled = loading;
        const btnText = gradeButton.querySelector('.btn-text');
        const btnLoading = gradeButton.querySelector('.btn-loading');

        if (loading) {
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline-block';
        } else {
            btnText.style.display = 'inline-block';
            btnLoading.style.display = 'none';
        }
    }

    function displayResults(data) {
        // Show metadata
        resultsMeta.innerHTML = `
            <span class="meta-item"><strong>Subject:</strong> ${data.subject}</span>
            <span class="meta-item"><strong>Type:</strong> ${data.assessmentType}</span>
        `;

        // Convert markdown-style formatting to HTML
        let formattedFeedback = data.feedback
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        // Format headers
        formattedFeedback = formattedFeedback.replace(/## (.*?)(?=<br>|$)/g, '<h3>$1</h3>');
        formattedFeedback = formattedFeedback.replace(/### (.*?)(?=<br>|$)/g, '<h4>$1</h4>');

        // Get grade category for badge styling
        const gradeCategory = getGradeCategory(data.grade);

        resultsContent.innerHTML = `
            <div class="grade-display">
                <h3>Final Grade</h3>
                <div class="grade-badge grade-${gradeCategory}">
                    ${data.grade}
                </div>
            </div>

            <div class="feedback-content">
                <h3>Detailed Feedback</h3>
                <div class="feedback-text">
                    ${formattedFeedback}
                </div>
            </div>
        `;

        resultsDiv.style.display = 'block';

        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getGradeCategory(grade) {
        // Extract numeric grade if present
        const match = grade.match(/(\d+)/);
        if (match) {
            const numericGrade = parseInt(match[1]);
            if (numericGrade >= 90) return 'excellent';
            if (numericGrade >= 75) return 'good';
            if (numericGrade >= 60) return 'average';
            return 'poor';
        }

        // Grade by letter or keywords
        const lowerGrade = grade.toLowerCase();
        if (lowerGrade.includes('a') || lowerGrade.includes('excellent')) return 'excellent';
        if (lowerGrade.includes('b') || lowerGrade.includes('good')) return 'good';
        if (lowerGrade.includes('c') || lowerGrade.includes('average')) return 'average';
        return 'poor';
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        errorDiv.style.display = 'none';
    }

    function hideResults() {
        resultsDiv.style.display = 'none';
    }
});
