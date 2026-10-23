const reviewStatus = document.querySelector('#review-status');
const reviewDescription = document.querySelector('#review-description');
const approveButton = document.querySelector('#approve-activity');
const rejectButton = document.querySelector('#reject-activity');
const approvalToken = new URLSearchParams(window.location.search).get('token');

if (approvalToken) history.replaceState(null, '', window.location.pathname);
else {
    reviewDescription.textContent = 'This review link is missing its approval token.';
    approveButton.disabled = true;
    rejectButton.disabled = true;
}

const submitDecision = async (status) => {
    approveButton.disabled = true;
    rejectButton.disabled = true;
    reviewStatus.textContent = 'Saving your decision…';

    try {
        const response = await fetch('/api/approval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: approvalToken, status })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not save this review decision.');
        reviewStatus.textContent = status === 'approved'
            ? 'Activity approved. It can now be saved and count toward XP.'
            : 'Activity rejected. It will not be saved or count toward XP.';
    } catch (error) {
        reviewStatus.textContent = error.message;
        approveButton.disabled = false;
        rejectButton.disabled = false;
        console.error('Could not submit activity review:', error);
    }
};

approveButton.addEventListener('click', () => submitDecision('approved'));
rejectButton.addEventListener('click', () => submitDecision('rejected'));
