# Project: Weather Dashboard

Time to put your API skills to work. You will build a weather dashboard that lets users search by city name and displays current conditions. This project ties together server load functions, form handling, API fetching, and conditional rendering.

You will use the free OpenWeatherMap API. Sign up at openweathermap.org for a free API key, then store it in your `.env` file.

## Project Setup

First, add your API key to the environment:

```bash
# .env
OPENWEATHER_API_KEY=your_api_key_here
```

Access it safely in server-side code using SvelteKit's private environment module.

## The Server Load Function

Create the load function and a form action to handle the city search:

```typescript
// src/routes/weather/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { OPENWEATHER_API_KEY } from '$env/static/private';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ url, fetch }) => {
  const city = url.searchParams.get('city');

  if (!city) {
    return { weather: null, city: null };
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );

    if (!response.ok) {
      return { weather: null, city, error: 'City not found' };
    }

    const weather = await response.json();

    return {
      city,
      weather: {
        temperature: Math.round(weather.main.temp),
        description: weather.weather[0].description,
        humidity: weather.main.humidity,
        windSpeed: weather.wind.speed,
        icon: weather.weather[0].icon
      }
    };
  } catch {
    return { weather: null, city, error: 'Failed to fetch weather data' };
  }
};
```

Using `url.searchParams` lets the search work with a simple GET form and makes the URL shareable.

## The Search Form

Build the page with a search form and weather display:

```svelte
<!-- src/routes/weather/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Weather Dashboard</h1>

<form method="GET" action="/weather">
  <input
    type="text"
    name="city"
    placeholder="Enter city name..."
    value={data.city ?? ''}
    required
  />
  <button type="submit">Search</button>
</form>

{#if data.error}
  <div class="error">
    <p>{data.error}. Please try another city.</p>
  </div>
{/if}

{#if data.weather}
  <div class="weather-card">
    <h2>{data.city}</h2>
    <img
      src="https://openweathermap.org/img/wn/{data.weather.icon}@2x.png"
      alt={data.weather.description}
    />
    <p class="temperature">{data.weather.temperature}&deg;C</p>
    <p class="description">{data.weather.description}</p>

    <div class="details">
      <div>
        <span>Humidity</span>
        <strong>{data.weather.humidity}%</strong>
      </div>
      <div>
        <span>Wind</span>
        <strong>{data.weather.windSpeed} m/s</strong>
      </div>
    </div>
  </div>
{:else if !data.error}
  <p>Search for a city to see the current weather.</p>
{/if}
```

## Styling the Dashboard

Add styles to make the dashboard look polished:

```svelte
<style>
  form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

  input {
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 0.5rem;
    font-size: 1rem;
    flex: 1;
  }

  button {
    padding: 0.75rem 1.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .weather-card {
    text-align: center;
    padding: 2rem;
    border-radius: 1rem;
    background: #f0f9ff;
  }

  .temperature {
    font-size: 3rem;
    font-weight: bold;
  }

  .details {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin-top: 1rem;
  }

  .error {
    color: #dc2626;
    padding: 1rem;
    background: #fef2f2;
    border-radius: 0.5rem;
  }
</style>
```

## Try It

Extend the weather dashboard with a five-day forecast. OpenWeatherMap provides a forecast endpoint at `/data/2.5/forecast`. Fetch the forecast data alongside the current weather, extract one entry per day, and display the upcoming conditions below the current weather card.

## Key Takeaways

- Use `$env/static/private` to safely access API keys in server-side code
- URL search params with GET forms create shareable, bookmarkable URLs
- Use `encodeURIComponent()` when inserting user input into URLs
- Return shaped data from the load function — only send what the page needs
- Handle both error states and empty states in the template
- Real API responses contain nested data — extract and reshape before returning
