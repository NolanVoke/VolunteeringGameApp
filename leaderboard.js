const list = document.querySelector('#leaderboard-list');
const status = document.querySelector('#leaderboard-status');
const refreshButton = document.querySelector('#leaderboard-refresh');

const formatNumber = (value, maximumFractionDigits = 0) => Number(value).toLocaleString(undefined, {
    maximumFractionDigits
});

const initialsFor = (name) => name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '').join('');

const renderVolunteers = (volunteers) => {
    if (!volunteers.length) {
        list.innerHTML = '<li class="leaderboard-message">No approved volunteer activities yet.</li>';
        return;
    }

    list.replaceChildren(...volunteers.map((volunteer, index) => {
        const row = document.createElement('li');
        row.className = 'leaderboard-person-row';

        const rank = document.createElement('span');
        rank.className = 'person-rank';
        rank.textContent = String(index + 1);

        const avatar = document.createElement('span');
        avatar.className = 'avatar avatar-small';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = initialsFor(volunteer.name);

        const name = document.createElement('span');
        name.className = 'person-name';
        name.textContent = volunteer.name;

        const hours = document.createElement('span');
        hours.className = 'person-turns';
        hours.textContent = formatNumber(volunteer.hours, 1);
        hours.setAttribute('aria-label', `${formatNumber(volunteer.hours, 1)} hours`);

        const activities = document.createElement('span');
        activities.className = 'person-score';
        activities.textContent = formatNumber(volunteer.activities);
        activities.setAttribute('aria-label', `${formatNumber(volunteer.activities)} activities`);

        row.append(rank, avatar, name, hours, activities);
        return row;
    }));
};

const loadLeaderboard = async () => {
    refreshButton.disabled = true;
    status.textContent = 'Loading approved activity…';
    try {
        const response = await fetch('/api/leaderboard', { headers: { Accept: 'application/json' } });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) {
            throw new Error(result?.error || 'Could not load the leaderboard. Try again.');
        }

        renderVolunteers(result.volunteers);
        document.querySelector('#community-hours').textContent = formatNumber(result.summary.totalHours, 1);
        document.querySelector('#community-volunteers').textContent = formatNumber(result.summary.volunteers);
        document.querySelector('#community-activity-count').textContent = formatNumber(result.summary.totalActivities);
        document.querySelector('#leaderboard-count').textContent = `${formatNumber(result.volunteers.length)} volunteers shown`;
        status.textContent = '';
    } catch (error) {
        list.innerHTML = '<li class="leaderboard-message">Leaderboard data could not be loaded.</li>';
        status.textContent = error.message;
    } finally {
        refreshButton.disabled = false;
    }
};

refreshButton.addEventListener('click', loadLeaderboard);
loadLeaderboard();