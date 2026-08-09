const API = {
geocode: "https://geocoding-api.open-meteo.com/v1/search",
forecast: "https://api.open-meteo.com/v1/forecast"
};
const STORAGE_KEYS = {
favorites: "weatherMissionFavorites",
recent: "weatherMissionRecent"
};
const searchForm = document.getElementById("searchForm");
const cityInput = document.getElementById("cityInput");
const statusEl = document.getElementById("status");
const matchesEl = document.getElementById("matches");
const dashboardEl = document.getElementById("dashboard");
const favoriteButton = document.getElementById("favoriteButton");
const favoritesList = document.getElementById("favoritesList");
const recentList = document.getElementById("recentList");
const clearDataButton = document.getElementById("clearDataButton");
const compareA = document.getElementById("compareA");
const compareB = document.getElementById("compareB");
const compareButton = document.getElementById("compareButton");
const compareResults = document.getElementById("compareResults");
let searchResults = [];
let activePlace = null;
let activeForecast = null;
let weatherChart = null;
let favorites = loadFromStorage(STORAGE_KEYS.favorites, []);
let recent = loadFromStorage(STORAGE_KEYS.recent, []);
renderSavedLists();
searchForm.addEventListener("submit", event => {
event.preventDefault();
const query = cityInput.value.trim();
if (!query) {
showStatus("Please type a city name.", true);
return;
}
searchCity(query);
});
document.querySelectorAll("[data-city]").forEach(button => {
button.addEventListener("click", () => {
cityInput.value = button.dataset.city;
searchCity(button.dataset.city);
});
});
favoriteButton.addEventListener("click", () => {
if (!activePlace) return;

addFavorite(activePlace);
});
clearDataButton.addEventListener("click", () => {
const confirmed = confirm("Clear all favorite cities and recent searches?");
if (!confirmed) return;
favorites = [];
recent = [];
saveToStorage(STORAGE_KEYS.favorites, favorites);
saveToStorage(STORAGE_KEYS.recent, recent);
renderSavedLists();
showStatus("Saved data cleared.");
});
compareButton.addEventListener("click", compareFavorites);
async function searchCity(query) {
try {
showStatus(`Searching for ${query}...`);
matchesEl.innerHTML = "";
const url = `${API.geocode}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
const response = await fetch(url);
if (!response.ok) {
throw new Error("The city search API did not respond correctly.");
}
const data = await response.json();
searchResults = data.results || [];
if (searchResults.length === 0) {
showStatus("No cities found. Try a larger nearby city.", true);
return;
}
renderMatches(searchResults);
showStatus("Choose the correct city from the matches below.");
} catch (error) {
showStatus(`Search failed: ${error.message}`, true);
}
}
function renderMatches(places) {
matchesEl.innerHTML = places.map((place, index) => {
const details = place.admin1 ? `${place.admin1}, ${place.country}` : place.country;
return `
<article class="match-card">
<div>
<strong>${place.name}</strong>
<p class="muted">${details} • ${place.latitude.toFixed(2)}, ${place.longitude.toFixed(2)}</
p>
</div>
<button onclick="loadPlace(${index})">Use this city</button>
</article>
`;
}).join("");
}
async function loadPlace(index) {
const place = searchResults[index];
if (!place) return;
activePlace = simplifyPlace(place);
addRecent(activePlace);

try {
showStatus(`Loading forecast for ${activePlace.name}...`);
activeForecast = await fetchForecast(activePlace);
renderDashboard(activePlace, activeForecast);
renderSavedLists();
showStatus("Forecast loaded.");
} catch (error) {
showStatus(`Forecast failed: ${error.message}`, true);
}
}
async function fetchForecast(place) {
const params = new URLSearchParams({
latitude: place.latitude,
longitude: place.longitude,
current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
temperature_unit: "fahrenheit",
wind_speed_unit: "mph",
precipitation_unit: "inch",
timezone: "auto"
});
const response = await fetch(`${API.forecast}?${params.toString()}`);
if (!response.ok) {
throw new Error("The forecast API did not respond correctly.");
}
return response.json();
}
function renderDashboard(place, forecast) {
dashboardEl.classList.remove("hidden");
const current = forecast.current;
const codeInfo = weatherCodeInfo(current.weather_code);
document.getElementById("placeName").textContent = place.name;
document.getElementById("placeDetails").textContent = place.admin1
? `${place.admin1}, ${place.country}`
: place.country;
document.getElementById("weatherIcon").textContent = codeInfo.icon;
document.getElementById("currentTemp").textContent = `${Math.round(current.temperature_2m)}°F`;
document.getElementById("currentSummary").textContent = codeInfo.label;
document.getElementById("feelsLike").textContent = `${Math.round(current.apparent_temperature)}°F`;
document.getElementById("humidity").textContent = `${current.relative_humidity_2m}%`;
document.getElementById("wind").textContent = `${Math.round(current.wind_speed_10m)} mph`;
renderTripVerdict(forecast.daily);
renderForecastCards(forecast.daily);
renderChart(forecast.daily);
}
function renderTripVerdict(daily) {
const highs = daily.temperature_2m_max;
const rain = daily.precipitation_probability_max;
const codes = daily.weather_code;
const averageHigh = average(highs);
const maxRain = Math.max(...rain);
const stormyDays = codes.filter(code => code >= 95).length;
let verdict = " Great trip weather";
let reason = `Average high is ${Math.round(averageHigh)}°F with max rain chance ${maxRain}%.`;

if (stormyDays > 0 || maxRain >= 70) {
verdict = " Risky weather";
reason += " Storms or heavy rain are possible, so make a backup plan.";
} else if (averageHigh < 55 || averageHigh > 90 || maxRain >= 45) {
verdict = " Mixed conditions";
reason += " It may still be fine, but pack carefully.";
} else {
reason += " This looks comfortable for outdoor plans.";
}
document.getElementById("tripVerdict").textContent = verdict;
document.getElementById("tripReason").textContent = reason;
}
function renderForecastCards(daily) {
const cards = daily.time.map((date, index) => {
const info = weatherCodeInfo(daily.weather_code[index]);
const day = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
return `
<article class="day-card">
<strong>${day}</strong>
<div class="emoji">${info.icon}</div>
<p class="temps">${Math.round(daily.temperature_2m_max[index])}° / $
{Math.round(daily.temperature_2m_min[index])}°</p>
<p class="muted">${daily.precipitation_probability_max[index]}% rain</p>
</article>
`;
}).join("");
document.getElementById("forecastCards").innerHTML = cards;
}
function renderChart(daily) {
const ctx = document.getElementById("weatherChart");
const labels = daily.time.map(date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined,
{ weekday: "short" }));
if (weatherChart) {
weatherChart.destroy();
}
weatherChart = new Chart(ctx, {
type: "line",
data: {
labels,
datasets: [
{
label: "High °F",
data: daily.temperature_2m_max,
tension: 0.3
},
{
label: "Low °F",
data: daily.temperature_2m_min,
tension: 0.3
},
{
label: "Rain chance %",
data: daily.precipitation_probability_max,
tension: 0.3
}
]
},
options: {

responsive: true,
plugins: {
legend: { position: "bottom" }
},
scales: {
y: { beginAtZero: false }
}
}
});
}
function addFavorite(place) {
const alreadySaved = favorites.some(saved => saved.id === place.id);
if (alreadySaved) {
showStatus(`${place.name} is already in favorites.`);
return;
}
favorites.push(place);
saveToStorage(STORAGE_KEYS.favorites, favorites);
renderSavedLists();
showStatus(`${place.name} saved as a favorite.`);
}
function addRecent(place) {
recent = recent.filter(item => item.id !== place.id);
recent.unshift(place);
recent = recent.slice(0, 5);
saveToStorage(STORAGE_KEYS.recent, recent);
}
function renderSavedLists() {
favoritesList.innerHTML = `<h3>Favorites</h3>` + renderPlaceList(favorites, "favorite");
recentList.innerHTML = `<h3>Recent searches</h3>` + renderPlaceList(recent, "recent");
renderCompareOptions();
}
function renderPlaceList(places, type) {
if (places.length === 0) {
return `<p class="muted">No ${type} places yet.</p>`;
}
return places.map(place => `
<article class="saved-card">
<div>
<strong>${place.name}</strong>
<p class="muted">${place.admin1 ? place.admin1 + ", " : ""}${place.country}</p>
</div>
<button onclick="loadSavedPlace('${type}', '${place.id}')">Load</button>
</article>
`).join("");
}
async function loadSavedPlace(type, id) {
const list = type === "favorite" ? favorites : recent;
const place = list.find(item => item.id === id);
if (!place) return;
activePlace = place;
try {
showStatus(`Loading ${place.name}...`);
activeForecast = await fetchForecast(place);
renderDashboard(place, activeForecast);
addRecent(place);
renderSavedLists();
showStatus("Forecast loaded.");

} catch (error) {
showStatus(`Could not load saved place: ${error.message}`, true);
}
}
function renderCompareOptions() {
const options = favorites.map(place => `<option value="${place.id}">${place.name}, ${place.country}
</option>`).join("");
compareA.innerHTML = options || `<option>No favorites yet</option>`;
compareB.innerHTML = options || `<option>No favorites yet</option>`;
}
async function compareFavorites() {
if (favorites.length < 2) {
compareResults.innerHTML = `<p class="muted">Save at least two favorite cities first.</p>`;
return;
}
const placeA = favorites.find(place => place.id === compareA.value);
const placeB = favorites.find(place => place.id === compareB.value);
if (!placeA || !placeB || placeA.id === placeB.id) {
compareResults.innerHTML = `<p class="muted">Choose two different favorite cities.</p>`;
return;
}
compareResults.innerHTML = `<p class="muted">Comparing cities...</p>`;
try {
const [forecastA, forecastB] = await Promise.all([
fetchForecast(placeA),
fetchForecast(placeB)
]);
compareResults.innerHTML = [
buildCompareCard(placeA, forecastA.daily),
buildCompareCard(placeB, forecastB.daily)
].join("");
} catch (error) {
compareResults.innerHTML = `<p class="muted">Compare failed: ${error.message}</p>`;
}
}
function buildCompareCard(place, daily) {
const averageHigh = Math.round(average(daily.temperature_2m_max));
const averageLow = Math.round(average(daily.temperature_2m_min));
const maxRain = Math.max(...daily.precipitation_probability_max);
const verdict = maxRain > 60 ? "Bring rain backup" : "Good outdoor chance";
return `
<article class="compare-card">
<div>
<strong>${place.name}</strong>
<p class="muted">Avg high: ${averageHigh}°F • Avg low: ${averageLow}°F • Max rain: ${maxRain}
%</p>
</div>
<span>${verdict}</span>
</article>
`;
}
function simplifyPlace(place) {
return {
id: `${place.name}-${place.latitude}-${place.longitude}`,
name: place.name,
admin1: place.admin1 || "",

country: place.country || "",
latitude: place.latitude,
longitude: place.longitude
};
}
function weatherCodeInfo(code) {
const weatherCodes = {
0: ["Clear sky", " "],
1: ["Mostly clear", " "],
2: ["Partly cloudy", " "],
3: ["Cloudy", " "],
45: ["Fog", " "],
48: ["Rime fog", " "],
51: ["Light drizzle", " "],
53: ["Drizzle", " "],
55: ["Heavy drizzle", " "],
61: ["Light rain", " "],
63: ["Rain", " "],
65: ["Heavy rain", " "],
71: ["Light snow", " "],
73: ["Snow", " "],
75: ["Heavy snow", " "],
80: ["Rain showers", " "],
81: ["Rain showers", " "],
82: ["Violent rain showers", " "],
95: ["Thunderstorm", " "],
96: ["Thunderstorm with hail", " "],
99: ["Severe thunderstorm", " "]
};
const result = weatherCodes[code] || ["Unknown conditions", " "];
return { label: result[0], icon: result[1] };
}
function average(numbers) {
return numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
}
function loadFromStorage(key, fallback) {
try {
const saved = localStorage.getItem(key);
return saved ? JSON.parse(saved) : fallback;
} catch (error) {
console.warn("Could not read localStorage", error);
return fallback;
}
}
function saveToStorage(key, value) {
localStorage.setItem(key, JSON.stringify(value));
}
function showStatus(message, isError = false) {
statusEl.textContent = message;
statusEl.style.color = isError ? "#dc2626" : "#64748b";
}
