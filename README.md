# Cairns

*Cairns* is a web App that let a user record its travels (locations, visits,
trips, pictures, notes), share them with others, track other peoples met along
the way, as well as record suggestions about other places/events to attend,
etc.

It's a demo app for a new framework to write local-first applications: NextGraph.

The app must run in a browser on desktop or mobile.
The technical stack to use is composed of:

- Ark-UI     - for the widgets
- Svelte 5   - for the application state and updating the DOM
- Daisy UI   - for styling
- MapLibreJS - for the map

Since NextGraph is still in development, the sharing features mentioned in the
specifications are tagged as "P1" and will not be implemented yet.

So for now, this is just a personal recorder and organizer.

See in docs, in that order:

- NextGraph.md  - A general introduction to NextGraph and how to use it to write
                  local-first apps.
- Specs.md      - A more detailed set of specifications about this app.
- UI.md         - Some additional remarks about the UI and specific widgets.
- Dev.md        - How to run your app locally on top of Nextgtraph.
