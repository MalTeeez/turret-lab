import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Controls are labelled implicitly — the input is passed in as a snippet, which
    // the compiler can't see inside the <label>.
    warningFilter: (w) => w.code !== 'a11y_label_has_associated_control',
  },
};
