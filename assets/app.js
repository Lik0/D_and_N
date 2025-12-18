const STORAGE_KEY = 'gift_progress_v1';
const toastEl = document.getElementById('toast');
const modalEl = document.getElementById('modal');
const modalTitleEl = document.getElementById('modal-title');
const modalQuestionEl = document.getElementById('modal-question');
const modalOptionsEl = document.getElementById('modal-options');
const modalStoryEl = document.getElementById('modal-story');
const modalActionsEl = document.getElementById('modal-actions');
const modalCloseEl = document.getElementById('modal-close');
const citySwitchEl = document.getElementById('city-switch');
const resetBtn = document.getElementById('reset-btn');

let data = null;
let map = null;
let markers = [];
let currentCity = 'kaliningrad';
let cityMaxOrders = {};
let currentPlaceId = null;

function loadProgress() {
  const emptyProgress = {
    kaliningrad: { unlockedMaxOrder: 1, solved: {} },
    grodno: { unlockedMaxOrder: 1, solved: {} }
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress;
    const parsed = JSON.parse(raw);
    return {
      kaliningrad: { ...emptyProgress.kaliningrad, ...parsed.kaliningrad },
      grodno: { ...emptyProgress.grodno, ...parsed.grodno }
    };
  } catch (e) {
    console.warn('Cannot read progress', e);
    return emptyProgress;
  }
}

let progress = loadProgress();

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

async function loadData() {
  const res = await fetch('data/places.json');
  if (!res.ok) throw new Error('Не удалось загрузить данные точек');
  data = await res.json();
  data.places.sort((a, b) => a.order - b.order);
  const cityOrders = {};
  data.places.forEach((p) => {
    cityOrders[p.city] = Math.max(cityOrders[p.city] || 0, p.order);
  });
  cityMaxOrders = cityOrders;
}

function initMap() {
  map = L.map('map');
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  osm.addTo(map);
  centerOnCity(currentCity);
}

function centerOnCity(city) {
  const info = data.cities[city];
  map.setView(info.center, info.zoom);
}

function createMarker(place) {
  const solved = Boolean(progress[place.city].solved[place.id]);
  const icon = L.divIcon({
    className: '',
    html: `<button class="marker-btn ${solved ? 'solved' : ''}" aria-label="${place.title}">${place.order}</button>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
  const marker = L.marker([place.lat, place.lng], { icon });
  marker.on('click', () => handleMarkerClick(place));
  return marker;
}

function renderMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
  const unlocked = progress[currentCity].unlockedMaxOrder;
  data.places
    .filter((p) => p.city === currentCity && p.order <= unlocked)
    .forEach((place) => {
      const marker = createMarker(place);
      marker.addTo(map);
      markers.push(marker);
    });
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  setTimeout(() => toastEl.classList.remove('visible'), 2200);
}

function openModal() {
  modalEl.classList.add('active');
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modalEl.classList.remove('active');
  modalEl.setAttribute('aria-hidden', 'true');
  currentPlaceId = null;
}

function renderStoryOnly(place) {
  modalTitleEl.textContent = place.title;
  modalQuestionEl.textContent = '';
  modalOptionsEl.innerHTML = '';
  modalStoryEl.textContent = place.story;
  modalActionsEl.innerHTML = '';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Закрыть';
  closeBtn.addEventListener('click', closeModal);
  modalActionsEl.appendChild(closeBtn);
  openModal();
}

function handleCorrectAnswer(place) {
  progress[place.city].solved[place.id] = true;
  const nextOrder = place.order + 1;
  const cityLimit = cityMaxOrders[place.city];
  progress[place.city].unlockedMaxOrder = Math.min(Math.max(progress[place.city].unlockedMaxOrder, nextOrder), cityLimit);
  saveProgress();
  renderMarkers();

  modalOptionsEl.innerHTML = '';
  modalQuestionEl.textContent = 'Верно!';
  modalStoryEl.textContent = place.story;
  modalActionsEl.innerHTML = '';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Закрыть';
  closeBtn.addEventListener('click', closeModal);
  modalActionsEl.appendChild(closeBtn);

  const nextPlace = data.places.find((p) => p.city === place.city && p.order === nextOrder);
  if (nextPlace) {
    setTimeout(() => {
      map.panTo([nextPlace.lat, nextPlace.lng], { animate: true, duration: 1.2 });
    }, 300);
  }
}

function renderQuiz(place) {
  modalTitleEl.textContent = place.title;
  modalQuestionEl.textContent = place.quiz.question;
  modalStoryEl.textContent = '';
  modalOptionsEl.innerHTML = '';
  modalActionsEl.innerHTML = '';

  place.quiz.options.forEach((option, idx) => {
    const btn = document.createElement('button');
    btn.textContent = option;
    btn.addEventListener('click', () => {
      if (idx === place.quiz.correctIndex) {
        handleCorrectAnswer(place);
      } else {
        modalQuestionEl.textContent = 'Не угадал, попробуй ещё';
      }
    });
    modalOptionsEl.appendChild(btn);
  });

  openModal();
}

function handleMarkerClick(place) {
  currentPlaceId = place.id;
  const solved = Boolean(progress[place.city].solved[place.id]);
  if (solved) {
    renderStoryOnly(place);
  } else {
    renderQuiz(place);
  }
}

function buildCitySwitch() {
  citySwitchEl.innerHTML = '';
  Object.entries(data.cities).forEach(([key, info]) => {
    const btn = document.createElement('button');
    btn.textContent = info.name;
    btn.dataset.city = key;
    btn.classList.toggle('active', key === currentCity);
    btn.addEventListener('click', () => {
      if (currentCity !== key) {
        currentCity = key;
        Array.from(citySwitchEl.children).forEach((child) => child.classList.toggle('active', child.dataset.city === key));
        centerOnCity(currentCity);
        renderMarkers();
      }
    });
    citySwitchEl.appendChild(btn);
  });
}

function applyUrlParams() {
  const params = new URLSearchParams(location.search);
  const cityParam = params.get('city');
  const focusId = params.get('focus');

  if (cityParam && data.cities[cityParam]) {
    currentCity = cityParam;
  }

  buildCitySwitch();
  centerOnCity(currentCity);
  renderMarkers();

  if (focusId) {
    const place = data.places.find((p) => p.id === focusId);
    if (!place) return;
    if (place.city !== currentCity) {
      currentCity = place.city;
      buildCitySwitch();
      centerOnCity(currentCity);
      renderMarkers();
    }

    const unlocked = progress[place.city].unlockedMaxOrder;
    if (place.order > unlocked) {
      showToast('Точка ещё закрыта');
      return;
    }

    const zoom = Math.max(data.cities[place.city].zoom, 15);
    map.setView([place.lat, place.lng], zoom);
    handleMarkerClick(place);
  }
}

function resetProgress() {
  if (!confirm('Сбросить весь прогресс?')) return;
  progress = {
    kaliningrad: { unlockedMaxOrder: 1, solved: {} },
    grodno: { unlockedMaxOrder: 1, solved: {} }
  };
  saveProgress();
  closeModal();
  centerOnCity(currentCity);
  renderMarkers();
}

async function init() {
  await loadData();
  initMap();
  buildCitySwitch();
  renderMarkers();
  applyUrlParams();
}

modalCloseEl.addEventListener('click', closeModal);
modalEl.addEventListener('click', (event) => {
  if (event.target === modalEl) closeModal();
});
resetBtn.addEventListener('click', resetProgress);

init().catch((err) => {
  console.error(err);
  showToast(err.message || 'Произошла ошибка');
});
