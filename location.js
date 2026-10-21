(() => {
    const button = document.querySelector('[data-location-button]');
    const label = document.querySelector('[data-location-text]');
    const status = document.querySelector('[data-location-status]');
    const storageKey = 'goodturn-location';

    if (!button || !label || !status) return;

    try {
        const savedLocation = localStorage.getItem(storageKey);
        if (savedLocation) label.textContent = savedLocation;
    } catch (error) {
        status.textContent = 'Your saved location could not be loaded.';
    }

    button.addEventListener('click', () => {
        if (!navigator.geolocation) {
            status.textContent = 'Location is not supported by this browser.';
            return;
        }

        button.disabled = true;
        label.textContent = 'Finding…';
        status.textContent = 'Requesting your location.';

        navigator.geolocation.getCurrentPosition(async ({ coords }) => {
            try {
                const query = new URLSearchParams({
                    format: 'jsonv2',
                    lat: String(coords.latitude),
                    lon: String(coords.longitude),
                    zoom: '10',
                    addressdetails: '1'
                });
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`Location lookup failed with status ${response.status}.`);
                }

                const result = await response.json();
                const address = result.address || {};
                const locality = address.city || address.town || address.village
                    || address.municipality || address.suburb || address.county;
                const region = address['ISO3166-2-lvl4']?.split('-').pop() || address.state;
                const placeName = [locality, region]
                    .filter((part, index, parts) => part && parts.indexOf(part) === index)
                    .join(', ');
                const locationName = placeName
                    || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;

                label.textContent = locationName;
                status.textContent = placeName
                    ? `Location updated to ${locationName}.`
                    : `A place name was unavailable. Showing coordinates: ${locationName}.`;

                try {
                    localStorage.setItem(storageKey, locationName);
                } catch (error) {
                    status.textContent += ' It will not be saved for the next visit.';
                }
            } catch (error) {
                label.textContent = 'Try again';
                status.textContent = 'Could not look up your location. Check your connection and try again.';
                console.error('Could not reverse geocode the current location:', error);
            } finally {
                button.disabled = false;
            }
        }, (error) => {
            const messages = {
                1: 'Location permission was denied. Allow access in your browser settings to try again.',
                2: 'Your location is currently unavailable. Try again in a moment.',
                3: 'Location request timed out. Try again.'
            };

            label.textContent = 'Try again';
            status.textContent = messages[error.code] || 'Could not get your location. Try again.';
            button.disabled = false;
        }, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        });
    });
})();
