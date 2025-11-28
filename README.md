# Musica

Musica is a modern, single-page web application for music discovery and streaming. Built with a focus on performance and usability, it provides a seamless audio experience using standard web technologies without the need for a complex backend infrastructure.

## Overview

This project demonstrates how to build a fully functional media player using only vanilla JavaScript. It connects to the iTunes Search API to fetch chart data, new releases, and search results. The application persists user data, including liked songs and custom playlists, directly to the browser's local storage, ensuring a personalized experience across sessions.

<img width="5760" height="3240" alt="Screen Shot 2025-11-28 at 21 27 00" src="https://github.com/user-attachments/assets/15eb4a6e-18e3-47d3-99ba-885e6835695e" />

<img width="5760" height="3240" alt="Screen Shot 2025-11-28 at 21 27 06" src="https://github.com/user-attachments/assets/f76029ec-ee6f-4696-bf21-f2e948a3a425" />

<img width="5760" height="3240" alt="Screen Shot 2025-11-28 at 21 27 10" src="https://github.com/user-attachments/assets/76d7c3b1-775e-4074-9e9c-cea452b8a114" />

<img width="5760" height="3240" alt="Screen Shot 2025-11-28 at 21 27 29" src="https://github.com/user-attachments/assets/64022873-ad00-493a-be89-2bb0cf78c9f2" />

<img width="5760" height="3240" alt="Screen Shot 2025-11-28 at 21 27 59" src="https://github.com/user-attachments/assets/415bb51d-1445-482d-bc89-6656a80f31bc" />

## Key Features

* **Music Discovery:** Users can browse top charts and new releases, or search for specific songs, albums, and artists dynamically fetched from the iTunes API.
* **Audio Playback:** A custom-built audio player supports essential controls including play/pause, track seeking, volume adjustment, shuffle, and repeat modes (repeat one/repeat all).
* **Library Management:** Users can "like" songs and albums to save them to their personal library. This data is stored locally on the device.
* **Playlist Creation:** The application includes a comprehensive playlist system allowing users to create named playlists, assign custom theme colors, and manage track order via a dedicated edit interface.
* **Responsive Design:** The interface adapts fluidly to different screen sizes. It features a sidebar navigation for desktop users and a bottom navigation bar with an expandable full-screen player for mobile users.
* **Context Menus:** Right-click interactions (or long-press on mobile) provide quick access to advanced actions like adding tracks to playlists or removing items from the library.

## Technology Stack

* **HTML5:** Semantic markup ensuring accessibility and proper document structure.
* **CSS3:** Advanced styling using CSS Variables for theming, Grid and Flexbox for layout, and media queries for responsiveness.
* **JavaScript:** Modular architecture handling state management, API requests, audio events, and DOM manipulation.

## Setup and Usage

This project requires no build tools or package managers. To run it locally:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/adiletbtrv/musica.git](https://github.com/adiletbtrv/musica.git)
    ```

2.  **Launch the application:**
    Navigate to the project directory and open the `index.html` file in any modern web browser.

## Project Structure

* `index.html`: The main entry point containing the application skeleton, SVG icons, and template structures.
* `styles.css`: Contains all visual styling, animations, and responsive breakpoints.
* `script.js`: Handles the core logic, including the API client, audio controller, state management, and UI rendering.

## Customization

The visual theme can be adjusted by modifying the CSS variables defined at the top of the stylesheet.

To change the primary accent color or background shades, locate the `:root` block in `styles.css`:

```css
:root {
  --color-accent: #1db954;
  --color-bg-primary: #000000;
  /* Additional variables... */
}
```
# License

This project is open-source and available under the MIT License. See the LICENSE file for more details.

# Author

Adilet Batyrov
