const reviewStatus = document.querySelector('#review-status');
const reviewDescription = document.querySelector('#review-description');
const activityDetails = document.querySelector('#review-activity-details');
const photoGrid = document.querySelector('#review-photo-grid');
const approveButton = document.querySelector('#approve-activity');
const rejectButton = document.querySelector('#reject-activity');
const approvalToken = new URLSearchParams(window.location.search).get('token');

approveButton.disabled = true;
rejectButton.disabled = true;

if (!approvalToken) {
    reviewDescription.textContent = 'This review link is missing its approval token.';
    approveButton.disabled = true;
    rejectButton.disabled = true;
} else {
    fetch(`/api/approval?token=${encodeURIComponent(approvalToken)}`)
        .then(async (response) => {
            const result = await response.json().catch(() => null);
            if (!response.ok || !result) throw new Error(result?.error || 'Could not load activity details.');
            return result.activity;
        })
        .then((activity) => {
            const details = [
                ['Volunteer', activity.name],
                ['Email', activity.email],
                ['Activity', activity.title],
                ['Organization or location', activity.organization || 'Not provided'],
                ['Date', activity.date],
                ['Time', `${Math.floor(activity.durationMinutes / 60)} hr ${activity.durationMinutes % 60} min`],
                ['Notes', activity.notes || 'None']
            ];
            activityDetails.replaceChildren(...details.flatMap(([label, value]) => {
                const term = document.createElement('dt');
                term.textContent = label;
                const description = document.createElement('dd');
                description.textContent = value;
                return [term, description];
            }));
            activityDetails.hidden = false;
            const hasBothPhotos = Boolean(activity.beforePhoto && activity.afterPhoto);
            if (hasBothPhotos) {
                document.querySelector('#review-before-photo').src = activity.beforePhoto;
                document.querySelector('#review-after-photo').src = activity.afterPhoto;
                photoGrid.hidden = false;
            }
            if (activity.status !== 'pending') {
                reviewDescription.textContent = `This activity has already been ${activity.status}.`;
            } else if (!hasBothPhotos) {
                reviewDescription.textContent = 'This older submission has no before-and-after photos and cannot be approved.';
            } else {
                approveButton.disabled = false;
                rejectButton.disabled = false;
            }
            history.replaceState(null, '', window.location.pathname);
        })
        .catch((error) => {
            reviewDescription.textContent = error.message;
            approveButton.disabled = true;
            rejectButton.disabled = true;
            console.error('Could not load activity for review:', error);
        });
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
