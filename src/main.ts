import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { init } from "./lib/ngSession";

// On first visit this redirects to the wallet login page; the app then
// reloads inside the wallet's iframe and the session callback fires.
await init();

mount(App, { target: document.getElementById("app")! });
