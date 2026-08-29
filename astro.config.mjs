// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://honorcart.com",
	integrations: [sitemap()],
	session: false,
	adapter: cloudflare({
		imageService: "compile",
	}),
});
