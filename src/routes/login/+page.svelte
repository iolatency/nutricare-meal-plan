<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import { AR_AUTH } from '$lib/locales/ar/auth';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let identifier = $state('');
	let showPassword = $state(false);
	let loading = $state(false);
	let dismissedSessionExpired = $state(false);

	let showSessionExpired = $derived(data.sessionExpired && !dismissedSessionExpired);

	$effect(() => {
		if (form?.identifier != null) identifier = form.identifier;
	});
</script>

<svelte:head>
	<title>تسجيل الدخول — NutriCare</title>
</svelte:head>

<div class="flex min-h-screen" dir="rtl">
	<!-- Left — branding (Nutricare-style panel) -->
	<div
		class="relative hidden w-1/2 overflow-hidden lg:flex"
		style="background: linear-gradient(135deg, #2ec27e 0%, #1a9e60 100%)"
	>
		<!-- Dot grid pattern -->
		<div
			class="absolute inset-0 opacity-25"
			style="background-image: radial-gradient(circle, rgba(255,255,255,0.7) 1.5px, transparent 1.5px); background-size: 28px 28px;"
		></div>
		<div class="absolute inset-0 opacity-10">
			<div class="absolute top-20 right-20 h-64 w-64 rounded-full border-2 border-white"></div>
			<div class="absolute bottom-32 left-16 h-48 w-48 rounded-full border-2 border-white"></div>
			<div class="absolute top-1/2 right-1/3 h-80 w-80 rounded-full border border-white"></div>
		</div>
		<div class="relative z-10 flex w-full flex-col items-center justify-center px-12 text-center">
			<img
				src="/logo-name.png"
				alt="NutriCare"
				class="mb-8 h-16 w-auto max-w-[min(280px,85vw)] object-contain brightness-0 invert"
				decoding="async"
			/>
			<h2 class="mb-4 text-3xl leading-relaxed font-bold text-white">
				{AR_AUTH.brandingTitle}<br />{AR_AUTH.brandingTitleLine2}
			</h2>
			<p class="max-w-sm text-base leading-relaxed text-green-100">{AR_AUTH.brandingSubtitle}</p>
		</div>
	</div>

	<!-- Right — form -->
	<div class="flex flex-1 items-center justify-center bg-gray-50 p-6 sm:p-8">
		<div class="w-full max-w-[420px]">
			<div class="mb-8 flex justify-center lg:hidden">
				<img
					src="/logo-name.png"
					alt="NutriCare"
					class="h-12 w-auto max-w-[min(240px,75vw)] object-contain"
					decoding="async"
				/>
			</div>

			<div
				class="rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
			>
				<div class="mb-6">
					<h1 class="mb-1 text-2xl font-bold text-gray-900">تسجيل الدخول</h1>
					<p class="text-sm text-gray-400">{AR_AUTH.loginIntro}</p>
				</div>

				{#if showSessionExpired}
					<div
						class="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
						role="status"
					>
						<svg
							class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10" stroke-width="2" />
							<path stroke-linecap="round" stroke-width="2" d="M12 16v-4M12 8h.01" />
						</svg>
						<p class="text-sm text-amber-700">{AR_AUTH.sessionExpired}</p>
					</div>
				{/if}

				{#if form?.error}
					<div
						class="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
						role="alert"
					>
						<svg
							class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10" stroke-width="2" />
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8v4M12 16h.01"
							/>
						</svg>
						<p class="text-sm text-red-600">{form.error}</p>
					</div>
				{/if}

				<form
					method="POST"
					class="space-y-5"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							await update();
							loading = false;
						};
					}}
				>
					<div class="space-y-2">
						<label for="identifier" class="text-sm font-semibold text-gray-700">
							{AR_AUTH.identifierLabel}
						</label>
						<input
							id="identifier"
							name="identifier"
							type="email"
							autocomplete="email"
							inputmode="email"
							bind:value={identifier}
							oninput={() => {
								dismissedSessionExpired = true;
							}}
							placeholder={AR_AUTH.identifierPlaceholder}
							required
							disabled={loading}
							class="flex h-11 w-full rounded-xl border px-4 py-2 text-sm font-medium transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 {form?.error
								? 'border-red-300 bg-red-50/30'
								: 'border-gray-200 bg-gray-50/80 focus:bg-white'}"
						/>
					</div>

					<div class="space-y-2">
						<label for="password" class="text-sm font-semibold text-gray-700"
							>{AR_AUTH.password}</label
						>
						<div class="relative">
							<input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								placeholder={AR_AUTH.passwordPlaceholder}
								autocomplete="current-password"
								required
								disabled={loading}
								class="flex h-11 w-full rounded-xl border py-2 ps-11 pe-4 text-sm font-medium transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 {form?.error
									? 'border-red-300 bg-red-50/30'
									: 'border-gray-200 bg-gray-50/80 focus:bg-white'}"
							/>
							<button
								type="button"
								class="absolute start-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 transition-colors hover:text-gray-600"
								tabindex="-1"
								aria-label={showPassword ? AR_AUTH.hidePassword : AR_AUTH.showPassword}
								onclick={() => (showPassword = !showPassword)}
							>
								{#if showPassword}
									<svg
										class="h-[18px] w-[18px]"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
										/>
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
								{:else}
									<svg
										class="h-[18px] w-[18px]"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								{/if}
							</button>
						</div>
					</div>

					<button
						type="submit"
						class="h-12 w-full rounded-xl text-base font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-70"
						style="background: linear-gradient(135deg, #2ec27e, #1a9e60)"
						disabled={loading}
					>
						{#if loading}
							<span class="inline-flex items-center justify-center gap-2">
								<svg
									class="h-[18px] w-[18px] animate-spin"
									fill="none"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									/>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									/>
								</svg>
								{AR_AUTH.loggingIn}
							</span>
						{:else}
							{AR_AUTH.loginButton}
						{/if}
					</button>
				</form>
			</div>

			<p class="mt-6 text-center text-sm text-gray-400">
				{AR_AUTH.noAccount}
				<a
					href={resolve('/register')}
					class="font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline"
				>
					{AR_AUTH.createAccount}
				</a>
			</p>
		</div>
	</div>
</div>
