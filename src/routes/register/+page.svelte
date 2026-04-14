<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';
	import { AR_REGISTER } from '$lib/locales/ar/register';
	import { AR_AUTH } from '$lib/locales/ar/auth';

	let { form }: { form: ActionData } = $props();

	type Step = 'role' | 'form' | 'verify' | 'success';
	let step = $state<Step>('role');
	let role = $state<'dietitian' | 'patient' | null>(null);
	let pendingEmail = $state('');
	let loading = $state(false);
	let resendSec = $state(0);

	let showPassword = $state(false);
	let showConfirm = $state(false);

	$effect(() => {
		if (resendSec <= 0) return;
		const t = setInterval(() => {
			resendSec = Math.max(0, resendSec - 1);
		}, 1000);
		return () => clearInterval(t);
	});

	const inputBase =
		'flex h-11 w-full rounded-xl border px-4 py-2 text-sm font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all';
	const inputOk = 'border-gray-200 bg-gray-50/80 focus:bg-white';
	const inputErr = 'border-red-300 bg-red-50/30';

	function fieldErr(name: string): string | undefined {
		if (!form || !('fieldErrors' in form) || !form.fieldErrors) return undefined;
		const fe = form.fieldErrors as Record<string, string>;
		return fe[name];
	}

	const allSteps = ['role', 'form', 'verify', 'success'];
	const stepLabels = [
		{ key: 'role', label: 'النوع' },
		{ key: 'form', label: 'البيانات' },
		{ key: 'verify', label: 'التحقق' }
	];
</script>

<svelte:head>
	<title>{AR_REGISTER.register} — NutriCare</title>
</svelte:head>

<div class="flex min-h-screen" dir="rtl">
	<!-- Left — branding panel -->
	<div
		class="relative hidden w-5/12 overflow-hidden lg:flex"
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
		<div
			class="relative z-10 flex w-full flex-col items-center justify-center px-12 pb-24 text-center"
		>
			<img
				src="/logo-name.png"
				alt="NutriCare"
				class="mb-8 h-16 w-auto max-w-[min(280px,85vw)] object-contain brightness-0 invert"
				decoding="async"
			/>
			<h2 class="mb-4 text-3xl leading-relaxed font-bold text-white">{AR_REGISTER.joinTitle}</h2>
			<p class="max-w-sm text-base leading-relaxed text-green-100">{AR_REGISTER.joinSubtitle}</p>
			<ul class="mt-10 flex w-full max-w-xs flex-col gap-3 text-right text-sm text-green-100">
				<li class="flex items-center gap-3">
					<span
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20"
					></span>
					{AR_REGISTER.featureAi}
				</li>
				<li class="flex items-center gap-3">
					<span
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20"
					></span>
					{AR_REGISTER.featureTrack}
				</li>
			</ul>
		</div>
		<!-- Glassy info card -->
		<div
			class="absolute right-8 bottom-8 left-8 z-10 rounded-xl border border-white/20 bg-white/10 px-5 py-3.5 backdrop-blur-sm"
		>
			<div class="flex items-center gap-3 text-sm text-white/90">
				<div class="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-300"></div>
				<p>أنشئ حسابك وابدأ رحلتك مع التغذية الصحية</p>
			</div>
		</div>
	</div>

	<!-- Right — form -->
	<div class="flex flex-1 items-center justify-center overflow-y-auto bg-gray-50 p-6 sm:p-8">
		<div class="w-full max-w-[480px] py-4">
			<!-- Mobile logo -->
			<div class="mb-8 flex justify-center lg:hidden">
				<img
					src="/logo-name.png"
					alt="NutriCare"
					class="h-12 w-auto max-w-[min(240px,75vw)] object-contain"
					decoding="async"
				/>
			</div>

			{#if form && 'message' in form && form.message}
				<div
					class="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
					role="alert"
				>
					<svg
						class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" /><path stroke-linecap="round" d="M12 8v4M12 16h.01" />
					</svg>
					<p class="text-sm text-red-600">{form.message}</p>
				</div>
			{/if}

			{#if step === 'success'}
				<!-- Success state -->
				<div
					class="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-[0_4px_32px_rgba(0,0,0,0.09)]"
					style="border-top: 2px solid #2ec27e"
				>
					<div
						class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"
					>
						<svg
							class="h-8 w-8 text-emerald-600"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					</div>
					<h2 class="mb-2 text-xl font-bold text-gray-900">{AR_REGISTER.verifyEmailSuccess}</h2>
					<p class="mx-auto mb-6 max-w-xs text-sm leading-relaxed text-gray-400">
						{AR_REGISTER.registerSuccessVerified}
					</p>
					<a
						href={resolve('/login')}
						class="inline-flex h-12 items-center justify-center rounded-xl px-8 text-base font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg hover:shadow-emerald-500/30"
						style="background: linear-gradient(135deg, #2ec27e, #1a9e60)"
					>
						{AR_REGISTER.goToLogin}
					</a>
				</div>
			{:else}
				<!-- Card for role / form / verify steps -->
				<div
					class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_32px_rgba(0,0,0,0.09)]"
					style="border-top: 2px solid #2ec27e"
				>
					<div class="p-8">
						<!-- Step progress indicator -->
						<div class="mb-7 flex items-center justify-center gap-0.5">
							{#each stepLabels as s, i}
								{@const currentIdx = allSteps.indexOf(step)}
								{@const stepIdx = allSteps.indexOf(s.key)}
								{@const done = stepIdx < currentIdx}
								{@const active = s.key === step}
								<div class="flex items-center">
									<div class="flex flex-col items-center gap-1">
										<div
											class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 {done
												? 'bg-emerald-600 text-white'
												: active
													? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400 ring-offset-1'
													: 'bg-gray-100 text-gray-400'}"
										>
											{#if done}
												<svg
													class="h-3.5 w-3.5"
													fill="none"
													stroke="currentColor"
													stroke-width="3"
													viewBox="0 0 24 24"
													aria-hidden="true"
												>
													<polyline points="20 6 9 17 4 12" />
												</svg>
											{:else}
												{i + 1}
											{/if}
										</div>
										<span
											class="text-[10px] font-medium {active
												? 'text-emerald-700'
												: 'text-gray-400'}">{s.label}</span
										>
									</div>
									{#if i < 2}
										<div
											class="mx-1.5 mb-4 h-0.5 w-10 rounded-full transition-all duration-300 {stepIdx <
											currentIdx
												? 'bg-emerald-400'
												: 'bg-gray-200'}"
										></div>
									{/if}
								</div>
							{/each}
						</div>

						<!-- STEP: ROLE -->
						{#if step === 'role'}
							<div class="mb-6">
								<h1 class="mb-1 text-2xl font-bold text-gray-900">{AR_REGISTER.register}</h1>
								<p class="text-sm text-gray-400">{AR_REGISTER.registerIntro}</p>
							</div>
							<p class="mb-4 text-sm font-semibold text-gray-700">{AR_REGISTER.selectRole}</p>
							<div class="flex flex-col gap-3">
								<button
									type="button"
									class="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-100 bg-white p-5 text-right transition-all hover:border-emerald-400 hover:bg-emerald-50/50 focus:border-emerald-500 focus:outline-none"
									onclick={() => {
										role = 'dietitian';
										step = 'form';
									}}
								>
									<div
										class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 transition-colors group-hover:bg-emerald-200"
									>
										<svg
											class="h-6 w-6"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
											/>
										</svg>
									</div>
									<div class="flex-1">
										<p class="text-base font-bold text-gray-900">{AR_REGISTER.roleDietitian}</p>
										<p class="mt-0.5 text-xs text-gray-400">إدارة المرضى وخطط التغذية</p>
									</div>
									<svg
										class="h-5 w-5 text-gray-300 transition-colors group-hover:text-emerald-500"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
									</svg>
								</button>
								<button
									type="button"
									class="group flex w-full items-center gap-4 rounded-xl border-2 border-gray-100 bg-white p-5 text-right transition-all hover:border-blue-400 hover:bg-blue-50/50 focus:border-blue-500 focus:outline-none"
									onclick={() => {
										role = 'patient';
										step = 'form';
									}}
								>
									<div
										class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-200"
									>
										<svg
											class="h-6 w-6"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
											/>
										</svg>
									</div>
									<div class="flex-1">
										<p class="text-base font-bold text-gray-900">{AR_REGISTER.rolePatient}</p>
										<p class="mt-0.5 text-xs text-gray-400">متابعة خطتك الغذائية</p>
									</div>
									<svg
										class="h-5 w-5 text-gray-300 transition-colors group-hover:text-blue-500"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
									</svg>
								</button>
							</div>

							<!-- STEP: FORM -->
						{:else if step === 'form' && role}
							<div class="mb-6 flex items-center justify-between">
								<div>
									<h1 class="mb-1 text-2xl font-bold text-gray-900">{AR_REGISTER.register}</h1>
									<p class="text-sm text-gray-400">{AR_REGISTER.registerIntro}</p>
								</div>
								<span
									class="rounded-full px-3 py-1.5 text-xs font-bold {role === 'dietitian'
										? 'bg-emerald-100 text-emerald-700'
										: 'bg-blue-100 text-blue-700'}"
								>
									{role === 'dietitian' ? AR_REGISTER.roleDietitian : AR_REGISTER.rolePatient}
								</span>
							</div>

							{#if fieldErr('_form')}
								<div
									class="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
									role="alert"
								>
									<svg
										class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<circle cx="12" cy="12" r="10" /><path
											stroke-linecap="round"
											d="M12 8v4M12 16h.01"
										/>
									</svg>
									<p class="text-sm text-red-600">{fieldErr('_form')}</p>
								</div>
							{/if}

							<form
								method="POST"
								action="?/register"
								class="space-y-4"
								use:enhance={() => {
									loading = true;
									return async ({ result, update }) => {
										await update({ reset: false });
										loading = false;
										if (result.type === 'success' && result.data?.registerOk) {
											const pe = result.data.pendingEmail;
											if (typeof pe === 'string') pendingEmail = pe;
											step = 'verify';
											resendSec = 60;
										}
									};
								}}
							>
								<input type="hidden" name="role" value={role} />

								<button
									type="button"
									class="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700"
									onclick={() => {
										step = 'role';
										role = null;
									}}
								>
									<svg
										class="h-3.5 w-3.5"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
									</svg>
									{AR_REGISTER.backToRole}
								</button>

								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-1.5">
										<label for="first_name" class="text-sm font-semibold text-gray-700"
											>{AR_REGISTER.firstName}</label
										>
										<input
											id="first_name"
											name="first_name"
											autocomplete="given-name"
											class="{inputBase} {fieldErr('first_name') ? inputErr : inputOk}"
										/>
										{#if fieldErr('first_name')}
											<p class="flex items-center gap-1 text-xs text-red-500">
												<svg
													class="h-3 w-3 flex-shrink-0"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													viewBox="0 0 24 24"
													aria-hidden="true"
													><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
												>
												{fieldErr('first_name')}
											</p>
										{/if}
									</div>
									<div class="space-y-1.5">
										<label for="last_name" class="text-sm font-semibold text-gray-700"
											>{AR_REGISTER.lastName}</label
										>
										<input
											id="last_name"
											name="last_name"
											autocomplete="family-name"
											class="{inputBase} {fieldErr('last_name') ? inputErr : inputOk}"
										/>
										{#if fieldErr('last_name')}
											<p class="flex items-center gap-1 text-xs text-red-500">
												<svg
													class="h-3 w-3 flex-shrink-0"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													viewBox="0 0 24 24"
													aria-hidden="true"
													><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
												>
												{fieldErr('last_name')}
											</p>
										{/if}
									</div>
								</div>

								<div class="space-y-1.5">
									<label for="username" class="text-sm font-semibold text-gray-700"
										>{AR_REGISTER.username}</label
									>
									<input
										id="username"
										name="username"
										autocomplete="username"
										placeholder="مثال: ahmed_nutrition"
										dir="ltr"
										class="{inputBase} {fieldErr('username') ? inputErr : inputOk}"
									/>
									{#if fieldErr('username')}
										<p class="flex items-center gap-1 text-xs text-red-500">
											<svg
												class="h-3 w-3 flex-shrink-0"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
											>
											{fieldErr('username')}
										</p>
									{/if}
								</div>

								<div class="space-y-1.5">
									<label for="phone" class="text-sm font-semibold text-gray-700"
										>{AR_REGISTER.phone}</label
									>
									<input
										id="phone"
										name="phone"
										type="tel"
										dir="ltr"
										placeholder="+966XXXXXXXXX"
										autocomplete="tel"
										class="{inputBase} {fieldErr('phone') ? inputErr : inputOk}"
									/>
									{#if fieldErr('phone')}
										<p class="flex items-center gap-1 text-xs text-red-500">
											<svg
												class="h-3 w-3 flex-shrink-0"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
											>
											{fieldErr('phone')}
										</p>
									{/if}
								</div>

								<div class="space-y-1.5">
									<label for="email" class="text-sm font-semibold text-gray-700"
										>{AR_REGISTER.email}</label
									>
									<input
										id="email"
										name="email"
										type="email"
										dir="ltr"
										placeholder="example@email.com"
										autocomplete="email"
										class="{inputBase} {fieldErr('email') ? inputErr : inputOk}"
									/>
									{#if fieldErr('email')}
										<p class="flex items-center gap-1 text-xs text-red-500">
											<svg
												class="h-3 w-3 flex-shrink-0"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
											>
											{fieldErr('email')}
										</p>
									{/if}
								</div>

								<div class="space-y-1.5">
									<label for="password" class="text-sm font-semibold text-gray-700"
										>{AR_REGISTER.password}</label
									>
									<div class="relative">
										<input
											id="password"
											name="password"
											type={showPassword ? 'text' : 'password'}
											autocomplete="new-password"
											class="{inputBase} ps-11 pe-4 {fieldErr('password') ? inputErr : inputOk}"
										/>
										<button
											type="button"
											class="absolute start-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 transition-colors hover:text-gray-600"
											tabindex="-1"
											aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
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
													/><line x1="1" y1="1" x2="23" y2="23" />
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
													<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
														cx="12"
														cy="12"
														r="3"
													/>
												</svg>
											{/if}
										</button>
									</div>
									{#if fieldErr('password')}
										<p class="flex items-center gap-1 text-xs text-red-500">
											<svg
												class="h-3 w-3 flex-shrink-0"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
											>
											{fieldErr('password')}
										</p>
									{/if}
								</div>

								<div class="space-y-1.5">
									<label for="confirm_password" class="text-sm font-semibold text-gray-700"
										>{AR_REGISTER.confirmPassword}</label
									>
									<div class="relative">
										<input
											id="confirm_password"
											name="confirm_password"
											type={showConfirm ? 'text' : 'password'}
											autocomplete="new-password"
											class="{inputBase} ps-11 pe-4 {fieldErr('confirmPassword')
												? inputErr
												: inputOk}"
										/>
										<button
											type="button"
											class="absolute start-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 transition-colors hover:text-gray-600"
											tabindex="-1"
											aria-label={showConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
											onclick={() => (showConfirm = !showConfirm)}
										>
											{#if showConfirm}
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
													/><line x1="1" y1="1" x2="23" y2="23" />
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
													<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
														cx="12"
														cy="12"
														r="3"
													/>
												</svg>
											{/if}
										</button>
									</div>
									{#if fieldErr('confirmPassword')}
										<p class="flex items-center gap-1 text-xs text-red-500">
											<svg
												class="h-3 w-3 flex-shrink-0"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg
											>
											{fieldErr('confirmPassword')}
										</p>
									{/if}
								</div>

								<button
									type="submit"
									disabled={loading}
									class="h-12 w-full rounded-xl text-base font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-70"
									style="background: linear-gradient(135deg, #2ec27e, #1a9e60)"
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
											{AR_REGISTER.registering}
										</span>
									{:else}
										{AR_REGISTER.registerButton}
									{/if}
								</button>
							</form>

							<!-- STEP: VERIFY -->
						{:else if step === 'verify'}
							<div class="mb-6">
								<h1 class="mb-1 text-2xl font-bold text-gray-900">
									{AR_REGISTER.verifyEmailTitle}
								</h1>
								<p class="text-sm text-gray-400">{AR_REGISTER.verifyEmailIntro}</p>
								<p class="mt-2 text-sm font-medium text-emerald-600" dir="ltr">{pendingEmail}</p>
							</div>

							{#if form && 'verifyError' in form && form.verifyError}
								<div
									class="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
									role="alert"
								>
									<svg
										class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<circle cx="12" cy="12" r="10" /><path
											stroke-linecap="round"
											d="M12 8v4M12 16h.01"
										/>
									</svg>
									<p class="text-sm text-red-600">{form.verifyError}</p>
								</div>
							{/if}

							{#if form && 'resendError' in form && form.resendError}
								<div
									class="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
								>
									<svg
										class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<circle cx="12" cy="12" r="10" /><path
											stroke-linecap="round"
											d="M12 8v4M12 16h.01"
										/>
									</svg>
									<p class="text-sm text-amber-700">{form.resendError}</p>
								</div>
							{/if}

							<form
								method="POST"
								action="?/verify"
								class="space-y-5"
								use:enhance={() => {
									loading = true;
									return async ({ result, update }) => {
										await update({ reset: false });
										loading = false;
										if (result.type === 'success' && result.data?.verifyOk) {
											step = 'success';
										}
									};
								}}
							>
								<input type="hidden" name="email" value={pendingEmail} />
								<div class="space-y-1.5">
									<label for="code" class="text-sm font-semibold text-gray-700"
										>{AR_REGISTER.verificationCode}</label
									>
									<input
										id="code"
										name="code"
										inputmode="numeric"
										maxlength="6"
										dir="ltr"
										placeholder="••••••"
										class="{inputBase} {inputOk} h-14 text-center font-mono text-2xl tracking-[0.5em]"
										autocomplete="one-time-code"
									/>
								</div>
								<button
									type="submit"
									disabled={loading}
									class="h-12 w-full rounded-xl text-base font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg disabled:opacity-70"
									style="background: linear-gradient(135deg, #2ec27e, #1a9e60)"
								>
									{loading ? AR_REGISTER.verifying : AR_REGISTER.verifyEmailButton}
								</button>
							</form>

							<form
								method="POST"
								action="?/resend"
								class="mt-4"
								use:enhance={() => {
									loading = true;
									return async ({ result, update }) => {
										await update({ reset: false });
										loading = false;
										if (result.type === 'success' && result.data?.resentOk) {
											resendSec = 60;
										}
									};
								}}
							>
								<input type="hidden" name="email" value={pendingEmail} />
								<button
									type="submit"
									disabled={loading || resendSec > 0}
									class="w-full text-sm font-semibold text-emerald-600 transition-colors hover:underline disabled:text-gray-400 disabled:no-underline"
								>
									{resendSec > 0 ? AR_REGISTER.resendCooldown(resendSec) : AR_REGISTER.resendCode}
								</button>
							</form>
						{/if}
					</div>
				</div>

				{#if step === 'role'}
					<p class="mt-6 text-center text-sm text-gray-400">
						{AR_REGISTER.haveAccount}
						<a
							href={resolve('/login')}
							class="font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline"
						>
							{AR_AUTH.loginButton}
						</a>
					</p>
				{/if}
			{/if}
		</div>
	</div>
</div>
