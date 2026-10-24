const status = document.querySelector('#verification-status');
const profileLink = document.querySelector('#verification-profile-link');
const verificationToken = new URLSearchParams(window.location.search).get('token');
history.replaceState(null, '', window.location.pathname);

if (!verificationToken) {
    status.textContent = 'This verification link is missing its token.';
} else {
    fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationToken })
    }).then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error(result?.error || 'Could not verify your email.');
        status.textContent = 'Your email is verified. Sign in to see your account and activity.';
        profileLink.hidden = false;
    }).catch((error) => {
        status.textContent = error.message;
        console.error('Could not verify account email:', error);
    });
}
