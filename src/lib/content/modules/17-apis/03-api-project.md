# Project: Weather Dashboard

Time to put your API skills to work. You will build a weather dashboard that combines multiple API patterns into a single, polished application. This project ties together server load functions, form handling, API fetching, error handling strategies, loading states, data caching, and API composition — all the patterns you need for any data-driven application.

You will use the free OpenWeatherMap API. Sign up at openweathermap.org for a free API key, then store it in your `.env` file. The free tier allows 60 requests per minute, which is plenty for development and moderate production use.

## Project Setup

First, add your API key to the environment:

```bash
# .env
OPENWEATHER_API_KEY=your_api_key_here
```

Access it safely in server-side code using SvelteKit's private environment module. Never expose API keys to the browser — all weather API calls go through your server.

Define the types for your weather data upfront. This prevents type errors throughout the project and documents the data shape:

```typescript
// src/lib/types/weather.ts
export type WeatherData = {
  temperature: number;
  feelsLike: number;
  description: string;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  visibility: number;
  icon: string;
  sunrise: string;
  sunset: string;
};

export type ForecastDay = {
  date: string;
  dayOfWeek: string;
  high: number;
  low: number;
  description: string;
  icon: string;
  precipitation: number;
};

export type CityWeather = {
  city: string;
  country: string;
  coordinates: { lat: number; lon: number };
  current: WeatherData;
  forecast: ForecastDay[];
};

export type WeatherError = {
  code: 'CITY_NOT_FOUND' | 'API_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR';
  message: string;
};
```

## API Composition: Combining Multiple Endpoints

Real applications rarely call a single API endpoint. The weather dashboard needs current conditions and a forecast. The naive approach makes two sequential requests. The smart approach runs them in parallel and transforms the results into a single, clean data structure:

```typescript
// src/lib/server/weather-api.ts
import { OPENWEATHER_API_KEY } from '$env/static/private';
import type { CityWeather, WeatherData, ForecastDay, WeatherError } from '$lib/types/weather';

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Transform raw API response into our clean type
function transformCurrentWeather(raw: any): WeatherData {
  return {
    temperature: Math.round(raw.main.temp),
    feelsLike: Math.round(raw.main.feels_like),
    description: raw.weather[0].description,
    humidity: raw.main.humidity,
    windSpeed: raw.wind.speed,
    windDirection: raw.wind.deg,
    pressure: raw.main.pressure,
    visibility: raw.visibility / 1000, // Convert meters to km
    icon: raw.weather[0].icon,
    sunrise: new Date(raw.sys.sunrise * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    }),
    sunset: new Date(raw.sys.sunset * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  };
}

// Extract one entry per day from the 3-hour forecast
function transformForecast(raw: any): ForecastDay[] {
  const dailyMap = new Map<string, any[]>();

  for (const entry of raw.list) {
    const date = entry.dt_txt.split(' ')[0]; // "2024-01-15"
    if (!dailyMap.has(date)) {
      dailyMap.set(date, []);
    }
    dailyMap.get(date)!.push(entry);
  }

  const days: ForecastDay[] = [];

  for (const [date, entries] of dailyMap) {
    // Skip today — we already have current weather
    const entryDate = new Date(date);
    const today = new Date();
    if (entryDate.toDateString() === today.toDateString()) continue;
    if (days.length >= 5) break;

    // Calculate high and low from all entries for this day
    const temps = entries.map(e => e.main.temp);
    const high = Math.round(Math.max(...temps));
    const low = Math.round(Math.min(...temps));

    // Use the midday entry for description and icon (most representative)
    const middayEntry = entries.find(e => e.dt_txt.includes('12:00:00')) ?? entries[0];

    // Calculate precipitation probability (max of all entries)
    const precipitation = Math.round(
      Math.max(...entries.map(e => (e.pop ?? 0) * 100))
    );

    days.push({
      date,
      dayOfWeek: entryDate.toLocaleDateString('en-US', { weekday: 'short' }),
      high,
      low,
      description: middayEntry.weather[0].description,
      icon: middayEntry.weather[0].icon,
      precipitation
    });
  }

  return days;
}

// Compose both API calls into a single response
export async function getWeatherForCity(
  city: string,
  fetchFn: typeof fetch = fetch
): Promise<{ data: CityWeather | null; error: WeatherError | null }> {
  const encodedCity = encodeURIComponent(city);
  const params = `appid=${OPENWEATHER_API_KEY}&units=metric`;

  try {
    // Run both requests in parallel — saves 200-400ms vs sequential
    const [currentRes, forecastRes] = await Promise.all([
      fetchFn(`${BASE_URL}/weather?q=${encodedCity}&${params}`),
      fetchFn(`${BASE_URL}/forecast?q=${encodedCity}&${params}`)
    ]);

    // Handle API errors
    if (currentRes.status === 404) {
      return {
        data: null,
        error: { code: 'CITY_NOT_FOUND', message: `Could not find "${city}". Check the spelling and try again.` }
      };
    }

    if (currentRes.status === 429) {
      return {
        data: null,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' }
      };
    }

    if (!currentRes.ok || !forecastRes.ok) {
      return {
        data: null,
        error: { code: 'API_ERROR', message: 'Weather service returned an error. Please try again later.' }
      };
    }

    const [currentData, forecastData] = await Promise.all([
      currentRes.json(),
      forecastRes.json()
    ]);

    return {
      data: {
        city: currentData.name,
        country: currentData.sys.country,
        coordinates: { lat: currentData.coord.lat, lon: currentData.coord.lon },
        current: transformCurrentWeather(currentData),
        forecast: transformForecast(forecastData)
      },
      error: null
    };
  } catch (err) {
    console.error('Weather API error:', err);
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Could not connect to the weather service. Check your internet connection.'
      }
    };
  }
}
```

**Why `fetchFn` as a parameter?** SvelteKit's `fetch` has special powers inside load functions: it deduplicates requests, adds credentials, and supports relative URLs. By accepting `fetch` as a parameter, we can pass SvelteKit's enhanced version from the load function while still allowing the function to be called from API routes.

## The Server Load Function

The load function handles the search parameter and returns data to the page:

```typescript
// src/routes/weather/+page.server.ts
import type { PageServerLoad } from './$types';
import { getWeatherForCity } from '$lib/server/weather-api';

export const load: PageServerLoad = async ({ url, fetch, setHeaders }) => {
  const city = url.searchParams.get('city');

  if (!city) {
    return { weather: null, city: null, error: null };
  }

  // Trim and validate the input
  const trimmedCity = city.trim();
  if (trimmedCity.length === 0) {
    return { weather: null, city: null, error: null };
  }
  if (trimmedCity.length > 100) {
    return {
      weather: null,
      city: trimmedCity,
      error: { code: 'API_ERROR' as const, message: 'City name is too long.' }
    };
  }

  const { data, error } = await getWeatherForCity(trimmedCity, fetch);

  // Cache successful responses for 5 minutes
  // This means repeated searches for the same city are instant
  if (data) {
    setHeaders({
      'Cache-Control': 'public, max-age=300, s-maxage=300'
    });
  }

  return {
    weather: data,
    city: trimmedCity,
    error
  };
};
```

**Design decisions explained:**

1. **GET form with `url.searchParams`:** The search uses a GET form, making the URL shareable and bookmarkable. `/weather?city=London` can be sent to a friend.
2. **Server-side fetching:** The API key stays on the server. The browser never sees it.
3. **Cache headers:** If the same city is searched again within 5 minutes, the response comes from cache (browser or CDN) with zero latency.
4. **Input validation:** We trim whitespace, check length, and handle empty strings before hitting the API.

## The Search Form and Weather Display

```svelte
<!-- src/routes/weather/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let { data } = $props();
  let searchInput = $state(data.city ?? '');
  let isSearching = $state(false);

  // Track if we are navigating (for loading state)
  $effect(() => {
    // Reset searching state when data changes (navigation completed)
    isSearching = false;
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;

    isSearching = true;
    // Use goto for client-side navigation — faster than a full page reload
    goto(`/weather?city=${encodeURIComponent(trimmed)}`, {
      keepFocus: true // Keep focus on the search input
    });
  }

  // Format wind direction to compass point
  function windDirection(degrees: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }
</script>

<svelte:head>
  <title>
    {data.weather
      ? `${data.weather.city} Weather — ${data.weather.current.temperature}°C`
      : 'Weather Dashboard'}
  </title>
  <meta
    name="description"
    content={data.weather
      ? `Current weather in ${data.weather.city}: ${data.weather.current.temperature}°C, ${data.weather.current.description}`
      : 'Search for current weather and 5-day forecast for any city worldwide.'}
  />
</svelte:head>

<main class="dashboard">
  <h1>Weather Dashboard</h1>

  <form onsubmit={handleSubmit} class="search-form">
    <div class="search-input-wrapper">
      <input
        type="text"
        bind:value={searchInput}
        placeholder="Enter city name..."
        aria-label="City name"
        required
        disabled={isSearching}
      />
      {#if isSearching}
        <div class="spinner" aria-label="Searching..."></div>
      {/if}
    </div>
    <button type="submit" disabled={isSearching}>
      {isSearching ? 'Searching...' : 'Search'}
    </button>
  </form>

  {#if data.error}
    <div class="error-card" role="alert">
      <h2>
        {#if data.error.code === 'CITY_NOT_FOUND'}
          City Not Found
        {:else if data.error.code === 'RATE_LIMITED'}
          Too Many Requests
        {:else}
          Something Went Wrong
        {/if}
      </h2>
      <p>{data.error.message}</p>
      {#if data.error.code === 'CITY_NOT_FOUND'}
        <p class="suggestion">
          Try searching for a major city nearby, or check the spelling.
        </p>
      {/if}
    </div>
  {/if}

  {#if data.weather}
    {@const w = data.weather}

    <!-- Current Weather Card -->
    <section class="current-weather" aria-label="Current weather">
      <div class="current-header">
        <div>
          <h2>{w.city}, {w.country}</h2>
          <p class="coordinates">
            {w.coordinates.lat.toFixed(2)}°, {w.coordinates.lon.toFixed(2)}°
          </p>
        </div>
        <img
          src="https://openweathermap.org/img/wn/{w.current.icon}@2x.png"
          alt={w.current.description}
          width="100"
          height="100"
        />
      </div>

      <div class="temperature-display">
        <span class="temp-value">{w.current.temperature}</span>
        <span class="temp-unit">°C</span>
      </div>
      <p class="description">{w.current.description}</p>
      <p class="feels-like">Feels like {w.current.feelsLike}°C</p>

      <div class="weather-details">
        <div class="detail">
          <span class="detail-label">Humidity</span>
          <span class="detail-value">{w.current.humidity}%</span>
        </div>
        <div class="detail">
          <span class="detail-label">Wind</span>
          <span class="detail-value">
            {w.current.windSpeed} m/s {windDirection(w.current.windDirection)}
          </span>
        </div>
        <div class="detail">
          <span class="detail-label">Pressure</span>
          <span class="detail-value">{w.current.pressure} hPa</span>
        </div>
        <div class="detail">
          <span class="detail-label">Visibility</span>
          <span class="detail-value">{w.current.visibility} km</span>
        </div>
        <div class="detail">
          <span class="detail-label">Sunrise</span>
          <span class="detail-value">{w.current.sunrise}</span>
        </div>
        <div class="detail">
          <span class="detail-label">Sunset</span>
          <span class="detail-value">{w.current.sunset}</span>
        </div>
      </div>
    </section>

    <!-- 5-Day Forecast -->
    {#if w.forecast.length > 0}
      <section class="forecast" aria-label="5-day forecast">
        <h3>5-Day Forecast</h3>
        <div class="forecast-grid">
          {#each w.forecast as day}
            <div class="forecast-day">
              <span class="day-name">{day.dayOfWeek}</span>
              <img
                src="https://openweathermap.org/img/wn/{day.icon}.png"
                alt={day.description}
                width="50"
                height="50"
              />
              <div class="day-temps">
                <span class="day-high">{day.high}°</span>
                <span class="day-low">{day.low}°</span>
              </div>
              <span class="day-description">{day.description}</span>
              {#if day.precipitation > 0}
                <span class="day-precip">{day.precipitation}% rain</span>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {:else if !data.error && !data.city}
    <!-- Empty State -->
    <div class="empty-state">
      <p>Search for a city to see the current weather and 5-day forecast.</p>
      <div class="quick-searches">
        <p>Try:</p>
        {#each ['London', 'New York', 'Tokyo', 'Sydney', 'Paris'] as city}
          <a href="/weather?city={encodeURIComponent(city)}">{city}</a>
        {/each}
      </div>
    </div>
  {/if}
</main>
```

## Loading States and Skeleton UIs

The loading state above uses a simple `isSearching` boolean, but for a production app you want skeleton UIs that match the shape of the content they replace. This prevents layout shift and gives users a visual preview of what is coming:

```svelte
<!-- src/lib/components/WeatherSkeleton.svelte -->
<div class="skeleton-card" aria-hidden="true">
  <div class="skeleton-header">
    <div class="skeleton-line" style="width: 60%; height: 1.5rem;"></div>
    <div class="skeleton-circle" style="width: 100px; height: 100px;"></div>
  </div>
  <div class="skeleton-line" style="width: 30%; height: 3rem; margin: 1rem 0;"></div>
  <div class="skeleton-line" style="width: 50%; height: 1rem;"></div>
  <div class="skeleton-details">
    {#each { length: 6 } as _}
      <div class="skeleton-detail">
        <div class="skeleton-line" style="width: 60%; height: 0.75rem;"></div>
        <div class="skeleton-line" style="width: 40%; height: 1rem;"></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .skeleton-card {
    padding: 2rem;
    border-radius: 1rem;
    background: #f0f9ff;
  }
  .skeleton-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
  }
  .skeleton-line {
    background: linear-gradient(90deg, #e2e8f0 25%, #edf2f7 50%, #e2e8f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 0.25rem;
  }
  .skeleton-circle {
    background: linear-gradient(90deg, #e2e8f0 25%, #edf2f7 50%, #e2e8f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .skeleton-details {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .skeleton-detail {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
```

Use it in the page while data is loading:

```svelte
{#if isSearching}
  <WeatherSkeleton />
{:else if data.weather}
  <!-- Real weather card -->
{/if}
```

## Data Caching and Revalidation

The server-side cache headers handle CDN caching, but for the client side, you can cache recent searches to avoid redundant API calls when the user searches for the same city again:

```typescript
// src/lib/stores/weather-cache.svelte.ts

type CachedWeather = {
  data: CityWeather;
  fetchedAt: number;
};

class WeatherCache {
  #cache = $state(new Map<string, CachedWeather>());
  #maxAge = 5 * 60 * 1000; // 5 minutes
  #maxEntries = 10;

  get(city: string): CityWeather | null {
    const key = city.toLowerCase().trim();
    const entry = this.#cache.get(key);

    if (!entry) return null;

    // Check if the cache entry has expired
    if (Date.now() - entry.fetchedAt > this.#maxAge) {
      this.#cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(city: string, data: CityWeather) {
    const key = city.toLowerCase().trim();

    // Evict oldest entry if at capacity
    if (this.#cache.size >= this.#maxEntries && !this.#cache.has(key)) {
      const oldestKey = this.#cache.keys().next().value;
      if (oldestKey) this.#cache.delete(oldestKey);
    }

    this.#cache.set(key, { data, fetchedAt: Date.now() });
  }

  // Recent searches for quick access
  get recentCities(): string[] {
    return [...this.#cache.keys()].reverse().slice(0, 5);
  }

  clear() {
    this.#cache = new Map();
  }
}

export const weatherCache = new WeatherCache();
```

Use the cache in the page component to show instant results for recently searched cities:

```svelte
<script lang="ts">
  import { weatherCache } from '$lib/stores/weather-cache.svelte';

  let { data } = $props();

  // Cache successful results
  $effect(() => {
    if (data.weather) {
      weatherCache.set(data.weather.city, data.weather);
    }
  });
</script>

<!-- Show recent searches -->
{#if weatherCache.recentCities.length > 0 && !data.weather}
  <div class="recent-searches">
    <h3>Recent searches</h3>
    {#each weatherCache.recentCities as city}
      <a href="/weather?city={encodeURIComponent(city)}">{city}</a>
    {/each}
  </div>
{/if}
```

## Error Handling Strategies

The weather dashboard demonstrates three levels of error handling:

### Level 1: API Response Errors

Handled in the API composition layer. Each HTTP status code maps to a user-friendly error type:

```typescript
// Already in weather-api.ts
if (currentRes.status === 404) {
  return { data: null, error: { code: 'CITY_NOT_FOUND', message: '...' } };
}
```

### Level 2: Network Errors

The `try/catch` around the fetch calls catches DNS failures, timeouts, and connection resets:

```typescript
} catch (err) {
  return { data: null, error: { code: 'NETWORK_ERROR', message: '...' } };
}
```

### Level 3: Unexpected Errors

SvelteKit's error boundary catches anything the load function does not handle. Create a custom error page:

```svelte
<!-- src/routes/weather/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="error-page">
  <h1>Something went wrong</h1>
  <p>{page.error?.message ?? 'An unexpected error occurred.'}</p>
  <a href="/weather">Back to Weather Dashboard</a>
</div>
```

### Retry Logic

For transient errors, offer the user a retry button that refetches the current URL:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  let isRetrying = $state(false);

  async function retry() {
    isRetrying = true;
    await invalidateAll(); // Re-runs all load functions for the current page
    isRetrying = false;
  }
</script>

{#if data.error && data.error.code !== 'CITY_NOT_FOUND'}
  <button onclick={retry} disabled={isRetrying}>
    {isRetrying ? 'Retrying...' : 'Try Again'}
  </button>
{/if}
```

`invalidateAll()` re-runs the load function without a full page reload, which is faster and preserves client-side state.

## Real-Time Data: Auto-Refresh

For a dashboard that shows live data, add automatic refresh on a timer:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';

  let { data } = $props();
  let lastUpdated = $state<Date | null>(null);
  let refreshCountdown = $state(300); // 5 minutes in seconds

  onMount(() => {
    // Update the countdown every second
    const countdownTimer = setInterval(() => {
      refreshCountdown--;
      if (refreshCountdown <= 0) {
        refreshCountdown = 300;
        if (data.weather) {
          invalidateAll(); // Refresh weather data
          lastUpdated = new Date();
        }
      }
    }, 1000);

    if (data.weather) {
      lastUpdated = new Date();
    }

    return () => clearInterval(countdownTimer);
  });
</script>

{#if data.weather && lastUpdated}
  <p class="last-updated">
    Last updated: {lastUpdated.toLocaleTimeString()}
    (refreshing in {Math.floor(refreshCountdown / 60)}:{String(refreshCountdown % 60).padStart(2, '0')})
  </p>
{/if}
```

## Styling the Dashboard

Complete styles for a polished, responsive dashboard:

```svelte
<style>
  .dashboard {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 1.5rem;
  }

  /* Search Form */
  .search-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

  .search-input-wrapper {
    flex: 1;
    position: relative;
  }

  .search-input-wrapper input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 2px solid #e2e8f0;
    border-radius: 0.5rem;
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  .search-input-wrapper input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .spinner {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid #e2e8f0;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
  }

  button[type="submit"] {
    padding: 0.75rem 1.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }

  button[type="submit"]:hover:not(:disabled) {
    background: #2563eb;
  }

  button[type="submit"]:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Error Card */
  .error-card {
    padding: 1.5rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.75rem;
    margin-bottom: 2rem;
  }

  .error-card h2 {
    color: #dc2626;
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
  }

  .error-card p {
    color: #7f1d1d;
  }

  .suggestion {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    opacity: 0.8;
  }

  /* Current Weather */
  .current-weather {
    padding: 2rem;
    border-radius: 1rem;
    background: linear-gradient(135deg, #e0f2fe, #f0f9ff);
    margin-bottom: 2rem;
  }

  .current-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
  }

  .current-header h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .coordinates {
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 0.25rem;
  }

  .temperature-display {
    margin: 0.5rem 0;
  }

  .temp-value {
    font-size: 4rem;
    font-weight: 700;
    line-height: 1;
  }

  .temp-unit {
    font-size: 2rem;
    vertical-align: super;
    color: #64748b;
  }

  .description {
    font-size: 1.25rem;
    text-transform: capitalize;
    color: #334155;
  }

  .feels-like {
    font-size: 0.9rem;
    color: #64748b;
    margin-top: 0.25rem;
  }

  .weather-details {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #cbd5e1;
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .detail-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
  }

  .detail-value {
    font-size: 1rem;
    font-weight: 600;
    color: #1e293b;
  }

  /* Forecast */
  .forecast {
    margin-bottom: 2rem;
  }

  .forecast h3 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  .forecast-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.75rem;
  }

  .forecast-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem 0.5rem;
    background: white;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .day-name {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .day-temps {
    display: flex;
    gap: 0.5rem;
  }

  .day-high {
    font-weight: 700;
  }

  .day-low {
    color: #94a3b8;
  }

  .day-description {
    font-size: 0.75rem;
    text-transform: capitalize;
    color: #64748b;
    text-align: center;
  }

  .day-precip {
    font-size: 0.7rem;
    color: #3b82f6;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #64748b;
  }

  .quick-searches {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    align-items: center;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .quick-searches a {
    padding: 0.375rem 0.75rem;
    background: #f1f5f9;
    border-radius: 2rem;
    color: #3b82f6;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .quick-searches a:hover {
    background: #e2e8f0;
  }

  .recent-searches {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .recent-searches h3 {
    font-size: 0.875rem;
    color: #64748b;
  }

  .recent-searches a {
    padding: 0.25rem 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 2rem;
    color: #475569;
    text-decoration: none;
    font-size: 0.8rem;
  }

  .last-updated {
    font-size: 0.8rem;
    color: #94a3b8;
    text-align: right;
    margin-bottom: 1rem;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .weather-details {
      grid-template-columns: repeat(2, 1fr);
    }
    .forecast-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .temp-value {
      font-size: 3rem;
    }
  }

  @media (max-width: 400px) {
    .forecast-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
```

## API Route Alternative

If you need to expose weather data as a JSON API (for a mobile app or other consumers), create an API route alongside the page:

```typescript
// src/routes/api/weather/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getWeatherForCity } from '$lib/server/weather-api';

export const GET: RequestHandler = async ({ url, fetch, setHeaders }) => {
  const city = url.searchParams.get('city');

  if (!city) {
    return json({ error: 'Missing city parameter' }, { status: 400 });
  }

  const { data, error } = await getWeatherForCity(city.trim(), fetch);

  if (error) {
    const status = error.code === 'CITY_NOT_FOUND' ? 404
      : error.code === 'RATE_LIMITED' ? 429
      : 500;
    return json({ error }, { status });
  }

  setHeaders({
    'Cache-Control': 'public, max-age=300, s-maxage=300'
  });

  return json(data);
};
```

This shares the same `getWeatherForCity` function, ensuring consistent behavior between the page and the API endpoint.

## Try It

Extend the weather dashboard with these additional features:

1. **Multi-city comparison:** Add a "Compare" feature that lets users search for 2-3 cities and displays their weather side by side. Use `Promise.all` to fetch all cities in parallel from the load function. Display the comparison in a responsive grid.

2. **Geolocation:** Add a "Use my location" button that uses the browser's Geolocation API. You will need a new API endpoint that accepts latitude/longitude instead of a city name. OpenWeatherMap supports this: `/weather?lat={lat}&lon={lon}`.

3. **Weather alerts:** The OpenWeatherMap One Call API (requires a different plan) provides weather alerts. Add a warning banner when severe weather is expected. For the free tier, show a simple warning when wind speed exceeds 15 m/s or temperature is below -10°C or above 40°C.

4. **Offline support:** Cache the last searched city's data in `localStorage` so the dashboard shows something useful even when the network is unavailable. Show a banner indicating the data is cached and may be stale.

5. **Unit toggle:** Add a Celsius/Fahrenheit toggle. Store the preference in a cookie so it persists across sessions. Modify the API call to use `units=imperial` when Fahrenheit is selected.

## Key Takeaways

- Use **`$env/static/private`** to safely access API keys — they never reach the browser
- **URL search params** with GET forms create shareable, bookmarkable URLs — `/weather?city=London` can be sent to anyone
- **API composition** (`Promise.all`) fetches multiple endpoints in parallel, cutting latency in half compared to sequential requests
- **Transform raw API data** into clean types before returning from the load function — only send what the page needs, in the shape the page expects
- **Typed errors** (`WeatherError` with a `code` discriminant) let the UI show specific messages and actions for each error type
- **Skeleton UIs** that match the shape of the final content prevent layout shift and give users a visual preview during loading
- **Cache headers** (`Cache-Control`) on load function responses make repeated searches instant from CDN or browser cache
- **Client-side caching** with a simple Map provides instant results for recently searched cities without any API call
- **`invalidateAll()`** re-runs load functions without a full page reload — use it for retry logic and auto-refresh
- Real API responses are deeply nested — **always reshape data** into flat, clean types that your components can consume directly
