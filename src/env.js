import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		NODE_ENV: z.enum(["development", "test", "production"]),
		UPSTASH_REDIS_REST_URL: z.string().optional(),
		UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
		// 氚云 ERP 配置（敏感信息）
		// 注意：SchemaCode 配置已移至 src/config/h3yun.config.ts
		H3YUN_ENGINE_CODE: z.string(),
		H3YUN_ENGINE_SECRET: z.string(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_WOOCOMMERCE_SITE_URL: z.string().optional(),
		NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_KEY: z.string().optional(),
		NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_SECRET: z.string().optional(),
		NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
		NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_WOOCOMMERCE_SITE_URL: process.env.NEXT_PUBLIC_WOOCOMMERCE_SITE_URL,
		NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_KEY: process.env.NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_KEY,
		NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_SECRET: process.env.NEXT_PUBLIC_WOOCOMMERCE_CONSUMER_SECRET,
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
		// 氚云 ERP 配置（敏感信息）
		H3YUN_ENGINE_CODE: process.env.H3YUN_ENGINE_CODE,
		H3YUN_ENGINE_SECRET: process.env.H3YUN_ENGINE_SECRET,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
