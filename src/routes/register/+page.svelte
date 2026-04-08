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
</script>

<svelte:head>
	<title>{AR_REGISTER.register} — NutriCare</title>
</svelte:head>

<div class="flex min-h-screen" dir="rtl">
	<div
		class="relative hidden w-5/12 overflow-hidden lg:flex"
		style="background: linear-gradient(135deg, #2ec27e 0%, #1a9e60 100%)"
	>
		<div class="absolute inset-0 opacity-10">
			<div class="absolute top-20 right-20 h-64 w-64 rounded-full border-2 border-white"></div>
			<div class="absolute bottom-32 left-16 h-48 w-48 rounded-full border-2 border-white"></div>
			<div class="absolute top-1/2 right-1/3 h-80 w-80 rounded-full border border-white"></div>
		</div>
		<div class="relative z-10 flex w-full flex-col items-center justify-center px-12 text-center">
			<img
				src="/logo-name.png"
				alt="NutriCare"
				class="mb-8 h-16 brightness-0 invert"
				width="200"
				height="64"
			/>
			<h2 class="mb-4 text-3xl leading-relaxed font-bold text-white">{AR_REGISTER.joinTitle}</h2>
			<p class="max-w-sm text-base leading-relaxed text-green-100">{AR_REGISTER.joinSubtitle}</p>
			<ul class="mt-10 flex w-full max-w-xs flex-col gap-3 text-right text-sm text-green-100">
				<li class="flex items-center gap-3">
					<span
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20"
						>✓</span
					>
					{AR_REGISTER.featureAi}
				</li>
				<li class="flex items-center gap-3">
					<span
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20"
						>✓</span
					>
					{AR_REGISTER.featureCalc}
				</li>
				<li class="flex items-center gap-3">
					<span
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20"
						>✓</span
					>
					{AR_REGISTER.featureTrack}
				</li>
				<li class="flex items-center gap-3">
					<span
						class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20"
						>✓</span
					>
					{AR_REGISTER.featureChat}
				</li>
			</ul>
		</div>
	</div>

	<div class="flex flex-1 items-center justify-center bg-gray-50 p-6 sm:p-8">
		<div class="w-full max-w-[440px]">
			<div class="mb-8 flex justify-center lg:hidden">
				<img
					src="/logo-name.png"
					alt="NutriCare"
					class="h-12 object-contain"
					width="160"
					height="48"
				/>
			</div>

			{#if form && 'message' in form && form.message}
				<div
					class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					role="alert"
				>
					{form.message}
				</div>
			{/if}

			{#if step === 'role'}
				<div class="mb-6">
					<h1 class="mb-1 text-2xl font-bold text-gray-900">{AR_REGISTER.register}</h1>
					<p class="text-sm text-gray-500">{AR_REGISTER.registerIntro}</p>
				</div>
				<p class="mb-4 text-sm font-semibold text-gray-700">{AR_REGISTER.selectRole}</p>
				<div class="flex flex-col gap-3 sm:flex-row">
					<button
						type="button"
						class="flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md"
						onclick={() => {
							role = 'dietitian';
							step = 'form';
						}}
					>
						<span class="text-3xl" aria-hidden="true">🩺</span>
						<span class="font-bold text-gray-900">{AR_REGISTER.roleDietitian}</span>
					</button>
					<button
						type="button"
						class="flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md"
						onclick={() => {
							role = 'patient';
							step = 'form';
						}}
					>
						<span class="text-3xl" aria-hidden="true">❤️</span>
						<span class="font-bold text-gray-900">{AR_REGISTER.rolePatient}</span>
					</button>
				</div>
				<p class="mt-8 text-center text-sm text-gray-500">
					{AR_REGISTER.haveAccount}
					<a href={resolve('/login')} class="font-semibold text-emerald-600 hover:underline"
						>{AR_AUTH.loginButton}</a
					>
				</p>
			{:else if step === 'form' && role}
				<button
					type="button"
					class="mb-4 text-sm font-medium text-emerald-600 hover:underline"
					onclick={() => {
						step = 'role';
						role = null;
					}}
				>
					← {AR_REGISTER.backToRole}
				</button>
				<div class="mb-6">
					<h1 class="mb-1 text-2xl font-bold text-gray-900">{AR_REGISTER.register}</h1>
					<p class="text-sm text-gray-500">
						{role === 'dietitian' ? AR_REGISTER.roleDietitian : AR_REGISTER.rolePatient}
					</p>
				</div>

				{#if fieldErr('_form')}
					<div
						class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					>
						{fieldErr('_form')}
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

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-1">
							<label for="first_name" class="text-sm font-semibold text-gray-700"
								>{AR_REGISTER.firstName}</label
							>
							<input
								id="first_name"
								name="first_name"
								class="{inputBase} {fieldErr('first_name') ? inputErr : inputOk}"
								autocomplete="given-name"
							/>
							{#if fieldErr('first_name')}
								<p class="text-xs text-red-600">{fieldErr('first_name')}</p>
							{/if}
						</div>
						<div class="space-y-1">
							<label for="last_name" class="text-sm font-semibold text-gray-700"
								>{AR_REGISTER.lastName}</label
							>
							<input
								id="last_name"
								name="last_name"
								class="{inputBase} {fieldErr('last_name') ? inputErr : inputOk}"
								autocomplete="family-name"
							/>
							{#if fieldErr('last_name')}
								<p class="text-xs text-red-600">{fieldErr('last_name')}</p>
							{/if}
						</div>
					</div>

					<div class="space-y-1">
						<label for="username" class="text-sm font-semibold text-gray-700"
							>{AR_REGISTER.username}</label
						>
						<input
							id="username"
							name="username"
							class="{inputBase} {fieldErr('username') ? inputErr : inputOk}"
							autocomplete="username"
						/>
						{#if fieldErr('username')}
							<p class="text-xs text-red-600">{fieldErr('username')}</p>
						{/if}
					</div>

					<div class="space-y-1">
						<label for="phone" class="text-sm font-semibold text-gray-700"
							>{AR_REGISTER.phone}</label
						>
						<input
							id="phone"
							name="phone"
							type="tel"
							class="{inputBase} {fieldErr('phone') ? inputErr : inputOk}"
							autocomplete="tel"
						/>
						{#if fieldErr('phone')}
							<p class="text-xs text-red-600">{fieldErr('phone')}</p>
						{/if}
					</div>

					<div class="space-y-1">
						<label for="email" class="text-sm font-semibold text-gray-700"
							>{AR_REGISTER.email}</label
						>
						<input
							id="email"
							name="email"
							type="email"
							class="{inputBase} {fieldErr('email') ? inputErr : inputOk}"
							autocomplete="email"
						/>
						{#if fieldErr('email')}
							<p class="text-xs text-red-600">{fieldErr('email')}</p>
						{/if}
					</div>

					<div class="space-y-1">
						<label for="password" class="text-sm font-semibold text-gray-700"
							>{AR_REGISTER.password}</label
						>
						<div class="relative">
							<input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								class="{inputBase} pe-12 {fieldErr('password') ? inputErr : inputOk}"
								autocomplete="new-password"
							/>
							<button
								type="button"
								class="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-gray-500"
								onclick={() => (showPassword = !showPassword)}
							>
								{showPassword ? 'إخفاء' : 'إظهار'}
							</button>
						</div>
						{#if fieldErr('password')}
							<p class="text-xs text-red-600">{fieldErr('password')}</p>
						{/if}
					</div>

					<div class="space-y-1">
						<label for="confirm_password" class="text-sm font-semibold text-gray-700"
							>{AR_REGISTER.confirmPassword}</label
						>
						<input
							id="confirm_password"
							name="confirm_password"
							type={showConfirm ? 'text' : 'password'}
							class="{inputBase} {fieldErr('confirmPassword') ? inputErr : inputOk}"
							autocomplete="new-password"
						/>
						{#if fieldErr('confirmPassword')}
							<p class="text-xs text-red-600">{fieldErr('confirmPassword')}</p>
						{/if}
					</div>

					<button
						type="submit"
						disabled={loading}
						class="h-12 w-full rounded-xl text-base font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:shadow-lg disabled:opacity-70"
						style="background: linear-gradient(135deg, #2ec27e, #1a9e60)"
					>
						{loading ? AR_REGISTER.registering : AR_REGISTER.registerButton}
					</button>
				</form>
			{:else if step === 'verify'}
				<div class="mb-6">
					<h1 class="mb-1 text-2xl font-bold text-gray-900">{AR_REGISTER.verifyEmailTitle}</h1>
					<p class="text-sm text-gray-500">{AR_REGISTER.verifyEmailIntro}</p>
					<p class="mt-2 text-sm font-medium text-emerald-700">{pendingEmail}</p>
				</div>

				{#if form && 'verifyError' in form && form.verifyError}
					<div
						class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					>
						{form.verifyError}
					</div>
				{/if}

				{#if form && 'resendError' in form && form.resendError}
					<div
						class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
					>
						{form.resendError}
					</div>
				{/if}

				<form
					method="POST"
					action="?/verify"
					class="space-y-4"
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
					<div class="space-y-1">
						<label for="code" class="text-sm font-semibold text-gray-700"
							>{AR_REGISTER.verificationCode}</label
						>
						<input
							id="code"
							name="code"
							inputmode="numeric"
							maxlength="6"
							class="{inputBase} {inputOk} text-center font-mono text-xl tracking-[0.3em]"
							autocomplete="one-time-code"
						/>
					</div>
					<button
						type="submit"
						disabled={loading}
						class="h-12 w-full rounded-xl text-base font-bold text-white shadow-md disabled:opacity-70"
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
						class="w-full text-sm font-semibold text-emerald-600 hover:underline disabled:text-gray-400 disabled:no-underline"
					>
						{resendSec > 0 ? AR_REGISTER.resendCooldown(resendSec) : AR_REGISTER.resendCode}
					</button>
				</form>
			{:else if step === 'success'}
				<div class="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
					<p class="mb-2 text-lg font-bold text-gray-900">{AR_REGISTER.verifyEmailSuccess}</p>
					<p class="mb-6 text-sm text-gray-600">{AR_REGISTER.registerSuccessVerified}</p>
					<a
						href={resolve('/login')}
						class="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-8 text-sm font-bold text-white hover:bg-emerald-700"
					>
						{AR_REGISTER.goToLogin}
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>
