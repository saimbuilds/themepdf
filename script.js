// ===========================
// PDF.js Configuration
// ===========================
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ===========================
// Global Variables
// ===========================
let uploadedFile = null;
let convertedPdfBlob = null;

// ===========================
// DOM Elements
// ===========================
const uploadSection = document.getElementById('uploadSection');
const processingSection = document.getElementById('processingSection');
const downloadSection = document.getElementById('downloadSection');

const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadBtn = document.getElementById('uploadBtn');

const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const processingInfo = document.getElementById('processingInfo');

const downloadBtn = document.getElementById('downloadBtn');
const convertAnotherBtn = document.getElementById('convertAnotherBtn');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

// ===========================
// Event Listeners
// ===========================

// Upload button click
uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

// Upload area click
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// File input change
fileInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
});

// Drag and drop events
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
});

// Download button click
downloadBtn.addEventListener('click', () => {
    if (convertedPdfBlob) {
        const url = URL.createObjectURL(convertedPdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dark-mode-' + (uploadedFile?.name || 'document.pdf');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('PDF downloaded successfully!');
    }
});

// Convert another button click
convertAnotherBtn.addEventListener('click', () => {
    resetApp();
});

// ===========================
// File Handling Functions
// ===========================

async function handleFileSelect(file) {
    console.log('handleFileSelect called with file:', file);

    if (!file) {
        console.log('No file provided');
        return;
    }

    console.log('File details:', {
        name: file.name,
        type: file.type,
        size: file.size
    });

    // Validate file type
    if (file.type !== 'application/pdf') {
        console.error('Invalid file type:', file.type);
        showToast('Please select a valid PDF file');
        return;
    }

    // Validate file size (rough estimate: 200 pages ≈ 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        console.error('File too large:', file.size);
        showToast('File is too large. Please select a PDF with up to 200 pages');
        return;
    }

    uploadedFile = file;
    console.log('File validated, starting processing...');

    // Validate page count
    try {
        console.log('Reading file as array buffer...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('Array buffer created, loading PDF...');

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log('PDF loaded successfully, pages:', pdf.numPages);

        if (pdf.numPages > 200) {
            console.error('Too many pages:', pdf.numPages);
            showToast(`PDF has ${pdf.numPages} pages. Maximum is 200 pages`);
            return;
        }

        // Start conversion - pass the PDF object directly
        showToast(`Processing ${pdf.numPages} pages...`);
        showSection('processing');
        console.log('Starting conversion...');
        await convertPdfToDarkMode(pdf, pdf.numPages);

    } catch (error) {
        console.error('Error processing PDF:', error);
        console.error('Error stack:', error.stack);
        showToast(`Error: ${error.message || 'Please try another file'}`);
        resetApp();
    }
}

// ===========================
// PDF Conversion Functions
// ===========================

async function convertPdfToDarkMode(pdf, totalPages) {
    try {
        updateProgress(0, 'Loading PDF...');

        // Create new PDF with jsPDF
        const { jsPDF } = window.jspdf;
        let outputPdf = null;

        // Process each page
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            updateProgress(
                (pageNum / totalPages) * 100,
                `Processing page ${pageNum} of ${totalPages}...`
            );

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });

            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF page to canvas
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Apply dark mode filter
            applyDarkModeFilter(context, canvas.width, canvas.height);

            // Convert canvas to image
            const imgData = canvas.toDataURL('image/jpeg', 0.95);

            // Add to PDF
            if (pageNum === 1) {
                // Initialize PDF with first page dimensions
                const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
                const width = viewport.width / 2.835; // Convert pixels to mm (96 DPI to 72 DPI)
                const height = viewport.height / 2.835;

                outputPdf = new jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: [width, height]
                });

                outputPdf.addImage(imgData, 'JPEG', 0, 0, width, height);
            } else {
                const width = viewport.width / 2.835;
                const height = viewport.height / 2.835;

                outputPdf.addPage([width, height]);
                outputPdf.addImage(imgData, 'JPEG', 0, 0, width, height);
            }
        }

        updateProgress(100, 'Finalizing PDF...');

        // Generate blob
        convertedPdfBlob = outputPdf.output('blob');

        // Show download section
        setTimeout(() => {
            showSection('download');
        }, 500);

    } catch (error) {
        console.error('Error converting PDF:', error);
        showToast('Error converting PDF. Please try again');
        resetApp();
    }
}

function applyDarkModeFilter(context, width, height) {
    // Get image data
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Process each pixel - optimized for eye comfort
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Calculate luminance to detect text vs background
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Invert colors but use softer tones for eye comfort
        // Pure white (background) → Dark gray (#1a1a1a = 26,26,26)
        // Pure black (text) → Off-white (#e8e8e8 = 232,232,232)

        if (luminance > 240) {
            // Very light colors (white backgrounds) → dark gray
            data[i] = 26;
            data[i + 1] = 26;
            data[i + 2] = 26;
        } else if (luminance < 15) {
            // Very dark colors (black text) → off-white
            data[i] = 232;
            data[i + 1] = 232;
            data[i + 2] = 232;
        } else {
            // Other colors - invert normally
            data[i] = 255 - r;
            data[i + 1] = 255 - g;
            data[i + 2] = 255 - b;
        }
        // Alpha channel (data[i + 3]) remains unchanged
    }

    // Put modified image data back
    context.putImageData(imageData, 0, 0);
}

// ===========================
// UI Helper Functions
// ===========================

function showSection(section) {
    uploadSection.classList.remove('active');
    processingSection.classList.remove('active');
    downloadSection.classList.remove('active');

    switch (section) {
        case 'upload':
            uploadSection.classList.add('active');
            break;
        case 'processing':
            processingSection.classList.add('active');
            break;
        case 'download':
            downloadSection.classList.add('active');
            break;
    }
}

function updateProgress(percentage, message) {
    progressFill.style.width = percentage + '%';
    progressText.textContent = Math.round(percentage) + '%';
    processingInfo.textContent = message;
}

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function resetApp() {
    uploadedFile = null;
    convertedPdfBlob = null;
    fileInput.value = '';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    processingInfo.textContent = 'Initializing...';
    showSection('upload');
}

// ===========================
// Initialize App
// ===========================

// Check if libraries are loaded
console.log('Checking libraries...');
console.log('PDF.js loaded:', typeof pdfjsLib !== 'undefined');
console.log('jsPDF loaded:', typeof window.jspdf !== 'undefined');

if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js not loaded!');
    showToast('Error: PDF.js library failed to load. Please refresh the page.');
}

if (typeof window.jspdf === 'undefined') {
    console.error('jsPDF not loaded!');
    showToast('Error: jsPDF library failed to load. Please refresh the page.');
}

// Show upload section on load
showSection('upload');
console.log('App initialized');

// Prevent default drag and drop on document
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
});

// ===========================
// Pixel Cursor Follower
// ===========================

// Only initialize on desktop (not mobile/tablet)
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1024;

if (!isMobile) {
    // Create cursor follower element
    const cursorFollower = document.createElement('div');
    cursorFollower.className = 'pixel-cursor-follower';
    document.body.appendChild(cursorFollower);

    let mouseX = 0;
    let mouseY = 0;
    let followerX = 0;
    let followerY = 0;

    // Track mouse position
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Smooth follow animation
    function animateCursor() {
        // Smooth easing
        const speed = 0.15;
        followerX += (mouseX - followerX) * speed;
        followerY += (mouseY - followerY) * speed;

        cursorFollower.style.left = followerX - 16 + 'px';
        cursorFollower.style.top = followerY - 16 + 'px';

        requestAnimationFrame(animateCursor);
    }

    animateCursor();

    // Scale cursor on click
    document.addEventListener('mousedown', () => {
        cursorFollower.style.transform = 'scale(0.8)';
    });

    document.addEventListener('mouseup', () => {
        cursorFollower.style.transform = 'scale(1)';
    });
}

// ===========================
// Like Button
// ===========================

function initializeLikeButton() {
    const likeButton = document.getElementById('likeButton');
    const likeCountElement = document.getElementById('likeCount');

    // Get like count and user liked status
    let likeCount = parseInt(localStorage.getItem('likeCount')) || 23; // Start from 23
    let userLiked = localStorage.getItem('userLiked') === 'true';

    // Update display
    likeCountElement.textContent = likeCount;
    if (userLiked) {
        likeButton.classList.add('liked');
    }

    // Handle click
    likeButton.addEventListener('click', () => {
        if (!userLiked) {
            // User is liking
            likeCount++;
            userLiked = true;
            likeButton.classList.add('liked');

            // Animate count
            animateLikeCount(likeCount - 1, likeCount);
        } else {
            // User is unliking
            likeCount--;
            userLiked = false;
            likeButton.classList.remove('liked');

            // Update count immediately
            likeCountElement.textContent = likeCount;
        }

        // Save to localStorage
        localStorage.setItem('likeCount', likeCount);
        localStorage.setItem('userLiked', userLiked);
    });
}

function animateLikeCount(from, to) {
    const likeCountElement = document.getElementById('likeCount');
    let current = from;
    const increment = 1;

    const timer = setInterval(() => {
        current += increment;
        if (current >= to) {
            current = to;
            clearInterval(timer);
        }
        likeCountElement.textContent = current;
    }, 50);
}

// Initialize like button on page load
initializeLikeButton();

// ===========================
// Visitor Counter
// ===========================

function updateVisitorCount() {
    // Get or initialize visitor count
    let count = localStorage.getItem('visitorCount');

    if (!count) {
        // First time - start from 67 (higher than likes)
        count = 67;
    } else {
        // Increment count for each visit
        count = parseInt(count) + 1;
    }

    // Save updated count
    localStorage.setItem('visitorCount', count);

    // Animate counter from 0 to current count
    const counterElement = document.getElementById('visitorCount');
    let currentCount = 0;
    const increment = Math.max(1, Math.ceil(count / 30));

    const timer = setInterval(() => {
        currentCount += increment;
        if (currentCount >= count) {
            currentCount = count;
            clearInterval(timer);
        }
        counterElement.textContent = currentCount.toString().padStart(4, '0');
    }, 30);
}

// Initialize counter on page load
updateVisitorCount();
