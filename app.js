const locationKey = 'volunteer-local-location';
const profileIconNameKey = 'volunteer-profile-icon-name';

const loadValue = (key, fallback) => {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
};

const saveValue = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
};

const initialsFor = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
const formatHours = (hours) => Number(hours.toFixed(2)).toString();
const minutesForActivity = (activity) => Number(activity.duration_minutes ?? Math.round(Number(activity.hours || 0) * 60));
const experienceForMinutes = (minutes) => minutes * 10;
const formatDuration = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (hours) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
    if (minutes) parts.push(`${minutes} min`);
    return parts.join(' ') || '0 min';
};

const levelProgressForExperience = (experience) => {
    let level = 0;
    let experienceInLevel = experience;
    let experienceNeeded = 100;

    while (experienceInLevel >= experienceNeeded) {
        experienceInLevel -= experienceNeeded;
        level += 1;
        experienceNeeded = (level + 1) * (200 * ((level + 1)/10));
    }

    return { level, experienceInLevel, experienceNeeded };
};

const updateProfileLabels = (currentProfile) => {
    document.querySelectorAll('[data-profile-initials]').forEach((avatar) => {
        avatar.textContent = currentProfile ? initialsFor(currentProfile.name) : '?';
    });
};

const updateLocationLabels = (name) => {
    document.querySelectorAll('[data-location-label]').forEach((label) => {
        label.textContent = name;
    });
};

const distanceInMiles = (first, second) => {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
        * Math.sin(longitudeDelta / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const renderDistances = (currentLocation) => {
    document.querySelectorAll('[data-latitude][data-longitude]').forEach((card) => {
        const distanceLabel = card.querySelector('.distance');
        if (!distanceLabel) return;

        if (!currentLocation) {
            distanceLabel.textContent = 'Set location to see distance';
            return;
        }

        const destination = {
            latitude: Number(card.dataset.latitude),
            longitude: Number(card.dataset.longitude)
        };
        distanceLabel.textContent = `${distanceInMiles(currentLocation, destination).toFixed(1)} mi away`;
    });
};

let profile = null;
let activities = [];
let submissions = [];
let accountMode = 'register';

const savedLocation = loadValue(locationKey, null);
const isLegacyBrooklynDefault = savedLocation?.name === 'Brooklyn, NY'
    && savedLocation.latitude === 40.6885
    && savedLocation.longitude === -73.9762;
let currentLocation = !isLegacyBrooklynDefault
    && savedLocation
    && Number.isFinite(savedLocation.latitude)
    && Number.isFinite(savedLocation.longitude)
    && typeof savedLocation.name === 'string'
    ? savedLocation
    : null;

const savedProfileIconName = loadValue(profileIconNameKey, null);
updateProfileLabels(typeof savedProfileIconName === 'string' ? { name: savedProfileIconName } : null);
updateLocationLabels(currentLocation?.name || 'Set location');
renderDistances(currentLocation);

document.querySelectorAll('.signup-button[data-organization]').forEach((link) => {
    const query = `${link.dataset.event} ${link.dataset.organization} volunteer signup`;
    link.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
});

const locationDialog = document.querySelector('#location-dialog');
const locationButton = document.querySelector('#location-button');
const locationStatus = document.querySelector('#location-status');
const useLocationButton = document.querySelector('#use-location');

locationButton?.addEventListener('click', () => {
    if (!locationDialog) {
        console.error('Location dialog is missing from this page.');
        return;
    }

    locationDialog.showModal();
});

const setLocation = (nextLocation) => {
    currentLocation = nextLocation;
    updateLocationLabels(currentLocation.name);
    renderDistances(currentLocation);
    const saved = saveValue(locationKey, currentLocation);
    if (locationStatus) {
        locationStatus.textContent = saved
            ? `Showing opportunities near ${currentLocation.name}.`
            : `Showing opportunities near ${currentLocation.name}, but this location could not be saved in this browser.`;
    }
    if (saved) locationDialog?.close();
    return saved;
};

useLocationButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
        locationStatus.textContent = 'Location is unavailable in this browser. Search for a city instead.';
        return;
    }

    useLocationButton.disabled = true;
    locationStatus.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(async (position) => {
        const coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        try {
            const params = new URLSearchParams({
                lat: coordinates.latitude,
                lon: coordinates.longitude,
                zoom: '10',
                addressdetails: '1',
                format: 'jsonv2'
            });
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error(`Reverse geocoding failed with status ${response.status}.`);
            const result = await response.json();
            const address = result.address || {};
            const locality = address.city || address.town || address.village
                || address.municipality || address.suburb || address.county;
            const region = address['ISO3166-2-lvl4']?.split('-').pop() || address.state;
            const name = [locality, region]
                .filter((part, index, parts) => part && parts.indexOf(part) === index)
                .join(', ')
                || `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
            setLocation({ ...coordinates, name });
        } catch (error) {
            const name = `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`;
            const saved = setLocation({ ...coordinates, name });
            locationStatus.textContent = `Using your exact location for distances; the place name lookup failed. Showing coordinates: ${name}.${saved ? '' : ' The location could not be saved in this browser.'}`;
            console.error('Could not look up the current location name:', error);
        } finally {
            useLocationButton.disabled = false;
        }
    }, (error) => {
        const messages = {
            1: 'Location permission was denied. Allow access in your browser settings or search for a city instead.',
            2: 'Your location is unavailable right now. Try again or search for a city.',
            3: 'The location request timed out. Try again or search for a city.'
        };
        locationStatus.textContent = messages[error.code] || 'Could not access your location. Search for a city instead.';
        useLocationButton.disabled = false;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

document.querySelector('#location-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#city-search');
    const query = input.value.trim();
    if (!query) {
        locationStatus.textContent = 'Enter a city or neighborhood to search.';
        input.focus();
        return;
    }

    locationStatus.textContent = 'Searching for that location…';
    try {
        const params = new URLSearchParams({ name: query, count: '1', language: 'en', format: 'json' });
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
        if (!response.ok) throw new Error('Location search failed');
        const result = await response.json();
        const match = result.results?.[0];
        if (!match) throw new Error('No matching location');
        setLocation({
            name: [match.name, match.admin1].filter(Boolean).join(', '),
            latitude: match.latitude,
            longitude: match.longitude
        });
    } catch {
        locationStatus.textContent = 'Location search failed. Check the name and try again.';
    }
});

const setAccountMode = (mode) => {
    accountMode = mode;
    const form = document.querySelector('#profile-form');
    if (!form) return;
    const nameLabel = document.querySelector('#profile-name-label');
    const nameInput = form.elements.name;
    const passwordInput = form.elements.password;
    const isLogin = mode === 'login';
    nameLabel.hidden = isLogin;
    nameInput.hidden = isLogin;
    nameInput.required = !isLogin;
    passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password';
    document.querySelector('#account-submit').textContent = isLogin ? 'Sign in' : 'Create account';
    document.querySelector('#account-mode-toggle').textContent = isLogin
        ? 'Need an account? Create one'
        : 'Already have an account? Sign in';
}

async function loadAccount() {
    const response = await fetch('/api/account');
    const result = await response.json().catch(() => null);
    if (response.status === 401) {
        profile = null;
        activities = [];
        submissions = [];
        saveValue(profileIconNameKey, null);
        renderProfile(profile, activities, submissions);
        updateProfileLabels(profile);
        return false;
    }
    if (!response.ok || !result) {
        throw new Error(result?.error || 'Could not load your account.');
    }
    profile = result.account;
    activities = result.activities;
    submissions = result.submissions;
    if (!saveValue(profileIconNameKey, profile.name)) {
        console.warn('Could not cache the profile name for the site navigation.');
    }
    renderProfile(profile, activities, submissions);
    updateProfileLabels(profile);
    return true;
}

document.querySelector('#account-mode-toggle')?.addEventListener('click', () => {
    setAccountMode(accountMode === 'register' ? 'login' : 'register');
    document.querySelector('#profile-status').textContent = '';
});

document.querySelector('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#profile-status');
    const submitButton = document.querySelector('#account-submit');
    const body = {
        email: form.elements.email.value.trim(),
        password: form.elements.password.value
    };
    if (accountMode === 'register') body.name = form.elements.name.value.trim();

    submitButton.disabled = true;
    try {
        const response = await fetch(`/api/auth/${accountMode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) {
            throw new Error(result?.error || 'Could not save your account.');
        }

        if (accountMode === 'register') {
            form.reset();
            setAccountMode('login');
            status.textContent = 'Account created. Check your email for a verification link before signing in.';
            return;
        }

        await loadAccount();
        form.reset();
        status.textContent = 'You are signed in. Your approved activities are synced to your account.';
    } catch (error) {
        status.textContent = error.message;
        console.error('Could not save account:', error);
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector('#account-logout')?.addEventListener('click', async () => {
    const status = document.querySelector('#profile-status');
    const button = document.querySelector('#account-logout');
    button.disabled = true;
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error(result?.error || 'Could not sign out.');
        profile = null;
        activities = [];
        submissions = [];
        saveValue(profileIconNameKey, null);
        setAccountMode('login');
        renderProfile(profile, activities, submissions);
        updateProfileLabels(profile);
        status.textContent = 'You are signed out.';
    } catch (error) {
        status.textContent = error.message;
        console.error('Could not sign out:', error);
    } finally {
        button.disabled = false;
    }
});

const photoPreviews = [
    ['beforePhoto', '#activity-before-preview'],
    ['afterPhoto', '#activity-after-preview']
];

const activityFormForPhotos = document.querySelector('#activity-form');
if (activityFormForPhotos) {
    photoPreviews.forEach(([fieldName, previewSelector]) => {
        const input = activityFormForPhotos.querySelector(`[name="${fieldName}"]`);
        const preview = document.querySelector(previewSelector);
        let previewUrl;
        input.addEventListener('change', () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = input.files[0] ? URL.createObjectURL(input.files[0]) : null;
            preview.hidden = !previewUrl;
            if (previewUrl) preview.src = previewUrl;
        });
    });

    activityFormForPhotos.addEventListener('reset', () => {
        photoPreviews.forEach(([, previewSelector]) => {
            const preview = document.querySelector(previewSelector);
            if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
            preview.removeAttribute('src');
            preview.hidden = true;
        });
    });
}

const photoAsJpeg = async (file) => {
    if (!file || !file.type.startsWith('image/')) throw new Error('Choose a valid image for each activity photo.');
    if (file.size > 15_000_000) throw new Error('Choose a photo smaller than 15 MB.');
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();

    for (const quality of [0.82, 0.7, 0.58, 0.45]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) throw new Error('Could not process an activity photo. Try another image.');
        if (blob.size <= 350_000) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Could not read an activity photo. Try another image.'));
                reader.readAsDataURL(blob);
            });
        }
    }
    throw new Error('Each photo must be small enough to upload. Try a smaller image.');
};

document.querySelector('#activity-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#activity-status');
    if (!profile) {
        status.textContent = 'Sign in or create an account before recording volunteer work.';
        return;
    }
    const hours = Number(form.elements.hours.value);
    const minutes = Number(form.elements.minutes.value);
    const entry = {
        title: form.elements.title.value.trim(),
        organization: form.elements.organization.value.trim(),
        durationMinutes: hours * 60 + minutes,
        date: form.elements.date.value,
        notes: form.elements.notes.value.trim()
    };
    if (!entry.title || !entry.date || !Number.isInteger(hours) || hours < 0 || hours > 24
        || !Number.isInteger(minutes) || minutes < 0 || minutes > 59
        || entry.durationMinutes <= 0 || entry.durationMinutes > 1440) {
        status.textContent = 'Enter a duration greater than zero and no more than 24 hours.';
        return;
    }
    const files = [
        form.elements.beforePhoto.files[0],
        form.elements.afterPhoto.files[0]
    ];
    if (files.some((file) => !file)) {
        status.textContent = 'Choose both a before photo and an after photo.';
        return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    status.textContent = 'Sending this activity for approval…';
    try {
        [entry.beforePhoto, entry.afterPhoto] = await Promise.all(files.map(photoAsJpeg));
        const response = await fetch('/api/activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) {
            throw new Error(result?.error || 'Could not submit this activity for approval.');
        }

        await loadAccount();
        form.reset();
        form.elements.date.value = new Date().toISOString().slice(0, 10);
        status.textContent = 'Activity sent for approval. It will be saved and award XP only if approved.';
    } catch (error) {
        status.textContent = error.message;
        console.error('Could not submit activity for approval:', error);
    } finally {
        submitButton.disabled = false;
    }
});

function renderProfile(currentProfile, currentActivities, currentSubmissions) {
    const profileForm = document.querySelector('#profile-form');
    if (!profileForm) return;

    profileForm.hidden = Boolean(currentProfile);
    document.querySelector('#account-logout').hidden = !currentProfile;
    profileForm.elements.name.value = currentProfile?.name || '';
    profileForm.elements.email.value = currentProfile?.email || '';
    document.querySelector('#profile-name').textContent = currentProfile?.name || 'No profile yet';
    document.querySelector('#profile-email').textContent = currentProfile?.email || 'Create an account to sync your records';

    const totalMinutes = currentActivities.reduce((total, activity) => total + minutesForActivity(activity), 0);
    const totalHours = totalMinutes / 60;
    const totalExperience = experienceForMinutes(totalMinutes);
    const levelProgress = levelProgressForExperience(totalExperience);
    document.querySelector('#hours-total').textContent = formatHours(totalHours);
    document.querySelector('#activity-total').textContent = currentActivities.length;
    document.querySelector('#experience-total').textContent = totalExperience.toLocaleString();
    document.querySelector('#profile-level').textContent = `Level ${levelProgress.level}`;
    document.querySelector('#level-progress-label').textContent = `Level ${levelProgress.level} progress · ${levelProgress.experienceInLevel.toLocaleString()} / ${levelProgress.experienceNeeded.toLocaleString()} XP`;
    const progressPercent = Math.floor(levelProgress.experienceInLevel / levelProgress.experienceNeeded * 100);
    document.querySelector('#level-progress-percent').textContent = `${progressPercent}%`;
    const progressTrack = document.querySelector('#level-progress-track');
    progressTrack.setAttribute('aria-valuenow', progressPercent);
    document.querySelector('#level-progress-fill').style.width = `${progressPercent}%`;
    document.querySelector('#activity-count-label').textContent = `${currentActivities.length} ${currentActivities.length === 1 ? 'activity' : 'activities'}`;

    const activityList = document.querySelector('#activity-list');
    activityList.innerHTML = currentActivities.length
        ? currentActivities.map((activity) => {
            const details = [activity.organization, activity.date, activity.notes].filter(Boolean).map(escapeHtml).join(' · ');
            return `<li class="activity-item">
                <div><strong>${escapeHtml(activity.title)}</strong><span>${details}</span></div>
                <span class="activity-hours">${formatDuration(minutesForActivity(activity))}</span>
            </li>`;
        }).join('')
        : '<li class="activity-empty">No activities recorded yet.</li>';

    const reviewRequestsList = document.querySelector('#review-requests-list');
    const visibleRequests = currentSubmissions;
    reviewRequestsList.innerHTML = visibleRequests.length
        ? visibleRequests.map((request) => {
            const detail = [
                request.organization,
                request.date,
                formatDuration(Number(request.duration_minutes ?? Number(request.hours || 0) * 60))
            ].filter(Boolean).map(escapeHtml).join(' · ');
            const label = request.status === 'rejected' ? 'Not approved' : 'Pending approval';
            const statusClass = request.status === 'rejected' ? 'review-request-status rejected' : 'review-request-status';
            return `<li class="activity-item">
                <div><strong>${escapeHtml(request.title)}</strong><span>${detail}</span></div>
                <span class="${statusClass}">${label}</span>
            </li>`;
        }).join('')
        : '<li class="activity-empty">No submissions awaiting review.</li>';

    const activityFields = document.querySelector('#activity-fields');
    if (activityFields) activityFields.disabled = !currentProfile;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

if (document.querySelector('#profile-form')) {
    const activityForm = document.querySelector('#activity-form');
    activityForm.elements.date.value = new Date().toISOString().slice(0, 10);
    renderProfile(profile, activities, submissions);
    setAccountMode('register');
}

loadAccount().catch((error) => {
    const status = document.querySelector('#profile-status');
    if (status) status.textContent = error.message;
    console.error('Could not load account:', error);
});
window.setInterval(() => {
    if (profile) loadAccount().catch((error) => console.error('Could not refresh account:', error));
}, 30000);

const leaderboardList = document.querySelector('#leaderboard-list');
if (leaderboardList) {
    const leaderboardStatus = document.querySelector('#leaderboard-status');
    fetch('/api/leaderboard')
        .then(async (response) => {
            const result = await response.json().catch(() => null);
            if (!response.ok || !result) throw new Error(result?.error || 'Could not load the leaderboard.');
            return result;
        })
        .then((result) => {
            document.querySelector('#leaderboard-hours').textContent = formatHours(Number(result.summary.totalHours));
            document.querySelector('#leaderboard-volunteers').textContent = result.summary.volunteers;
            document.querySelector('#leaderboard-count').textContent = `${result.entries.length} ${result.entries.length === 1 ? 'volunteer' : 'volunteers'}`;
            leaderboardList.innerHTML = result.entries.length
                ? result.entries.map((entry) => `<li class="leaderboard-person-row${entry.account_id === result.currentAccountId ? ' current-user' : ''}">
                    <span class="person-rank">${entry.rank}</span>
                    <span class="avatar avatar-small avatar-tone-${entry.rank % 2}" aria-hidden="true">${escapeHtml(initialsFor(entry.name))}</span>
                    <span class="person-name">${escapeHtml(entry.name)}${entry.account_id === result.currentAccountId ? ' (you)' : ''}</span>
                    <span class="person-turns">${formatHours(Number(entry.total_minutes) / 60)}<small> hrs</small></span>
                    <span class="person-score">${entry.activity_count}<small> activities</small></span>
                </li>`).join('')
                : '<li class="activity-empty">No approved volunteer activity yet. Be the first to contribute.</li>';
            leaderboardStatus.textContent = '';
        })
        .catch((error) => {
            leaderboardStatus.textContent = error.message;
            console.error('Could not load leaderboard:', error);
        });
}