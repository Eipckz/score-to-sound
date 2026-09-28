# Score to Sound

A browser-based melody reader and playback tool. Photos stay on your device. The current optical reader estimates clear single-line treble melodies; review detected notes and rhythms before playback.

## Run locally

```sh
npm install
npm run dev
```

## Deploy

The GitHub Actions workflow builds and deploys this app to GitHub Pages after pushes to `main`. Select **Settings → Pages → GitHub Actions** as the Pages source.

Printed tempo is not detected reliably yet, so enter the BPM in the tempo field. Use the quick note keys to enter or correct notes, choose note length, and play them back with synthesized audio.
