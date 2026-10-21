const profileKey = 'volunteer-local-profile';
const activityKey = 'volunteer-local-activities';
const locationKey = 'volunteer-local-location';

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
const formatHours = (hours) => Number(hours.toFixed(1)).toString();

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
        const destination = {
            latitude: Number(card.dataset.latitude),
            longitude: Number(card.dataset.longitude)
        };
        const distanceLabel = card.querySelector('.distance');
        if (distanceLabel) {
            distanceLabel.textContent = `${distanceInMiles(currentLocation, destination).toFixed(1)} mi away`;
        }
    });
};

let profile = loadValue(profileKey, null);
let activities = loadValue(activityKey, []);
if (!Array.isArray(activities)) activities = [];

let location = loadValue(locationKey, {
    name: 'Brooklyn, NY',
    latitude: 40.6885,
    longitude: -73.9762
});

updateProfileLabels(profile);
updateLocationLabels(location.name);
renderDistances(location);

document.querySelectorAll('.signup-button[data-organization]').forEach((link) => {
    const query = `${link.dataset.event} ${link.dataset.organization} volunteer signup`;
    link.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
});

const locationDialog = document.querySelector('#location-dialog');
const locationButton = document.querySelector('#location-button');
const locationStatus = document.querySelector('#location-status');

locationButton?.addEventListener('click', () => locationDialog?.showModal());

const setLocation = (nextLocation) => {
    location = nextLocation;
    saveValue(locationKey, location);
    updateLocationLabels(location.name);
    renderDistances(location);
    if (locationStatus) locationStatus.textContent = `Showing opportunities near ${location.name}.`;
    locationDialog?.close();
};

document.querySelector('#use-location')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
        locationStatus.textContent = 'Location is unavailable in this browser. Search for a city instead.';
        return;
    }

    locationStatus.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(async (position) => {
        const coordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        try {
            const params = new URLSearchParams({
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                language: 'en',
                format: 'json'
            });
            const response = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?${params}`);
            if (!response.ok) throw new Error('Reverse geocoding failed');
            const result = await response.json();
            const name = result.name ? `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}` : 'Current location';
            setLocation({ ...coordinates, name });
        } catch {
            setLocation({ ...coordinates, name: 'Current location' });
        }
    }, () => {
        locationStatus.textContent = 'Could not access your location. Search for a city instead.';
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
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

document.querySelector('#profile-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const nextProfile = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim()
    };
    const status = document.querySelector('#profile-status');

    if (!nextProfile.name || !nextProfile.email) {
        status.textContent = 'Enter your name and email to create a profile.';
        return;
    }
    if (!saveValue(profileKey, nextProfile)) {
        status.textContent = 'Could not save your profile in this browser. Check its storage settings.';
        return;
    }

    profile = nextProfile;
    renderProfile(profile, activities);
    updateProfileLabels(profile);
    status.textContent = 'Profile saved on this browser.';
});

document.querySelector('#activity-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#activity-status');
    if (!profile) {
        status.textContent = 'Create your profile before recording volunteer work.';
        return;
    }

    const entry = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: form.elements.title.value.trim(),
        organization: form.elements.organization.value.trim(),
        hours: Number(form.elements.hours.value),
        date: form.elements.date.value,
        notes: form.elements.notes.value.trim()
    };
    if (!entry.title || !entry.date || !Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > 24) {
        status.textContent = 'Enter an activity, date, and a number of hours from 0.1 to 24.';
        return;
    }

    const nextActivities = [entry, ...activities];
    if (!saveValue(activityKey, nextActivities)) {
        status.textContent = 'Could not save this activity in the browser. Check its storage settings.';
        return;
    }

    activities = nextActivities;
    renderProfile(profile, activities);
    form.reset();
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    status.textContent = 'Volunteer activity recorded on this browser.';
});

function renderProfile(currentProfile, currentActivities) {
    const profileForm = document.querySelector('#profile-form');
    if (!profileForm) return;

    profileForm.elements.name.value = currentProfile?.name || '';
    profileForm.elements.email.value = currentProfile?.email || '';
    document.querySelector('#profile-name').textContent = currentProfile?.name || 'No profile yet';
    document.querySelector('#profile-email').textContent = currentProfile?.email || 'Create a profile on this browser';

    const totalHours = currentActivities.reduce((total, activity) => total + Number(activity.hours || 0), 0);
    document.querySelector('#hours-total').textContent = formatHours(totalHours);
    document.querySelector('#activity-total').textContent = currentActivities.length;
    document.querySelector('#activity-count-label').textContent = `${currentActivities.length} ${currentActivities.length === 1 ? 'activity' : 'activities'}`;

    const activityList = document.querySelector('#activity-list');
    activityList.innerHTML = currentActivities.length
        ? currentActivities.map((activity) => {
            const details = [activity.organization, activity.date, activity.notes].filter(Boolean).map(escapeHtml).join(' · ');
            return `<li class="activity-item">
                <div><strong>${escapeHtml(activity.title)}</strong><span>${details}</span></div>
                <span class="activity-hours">${formatHours(Number(activity.hours))} hrs</span>
            </li>`;
        }).join('')
        : '<li class="activity-empty">No activities recorded yet.</li>';

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
    renderProfile(profile, activities);
}