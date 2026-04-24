<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

let name = $state("");
let age = $state("");
let gender = $state("");
let weight = $state("");
let height = $state("");
let calories = $state("");
let diet = $state("");
let goal = $state("");
let allergies = $state("");
</script>

<svelte:head>
	<title>NutriCare — Meal Plan</title>
</svelte:head>

<<<<<<< HEAD
<div class="mx-auto max-w-2xl px-6 py-16" dir="rtl">
	<h1 class="mb-2 text-2xl font-bold text-gray-900">مرحباً، {data.user.name}</h1>
	<p class="mb-8 text-gray-600">
		أنت مسجّل كـ {data.user.role === 'dietitian' ? 'أخصائي تغذية' : 'مريض'}. لوحة التحكم قيد
		الإعداد.
	</p>
	{#if data.user.role === 'patient'}
		<p class="mb-6">
			<a
				href="/patient/messages"
				class="inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
			>
				الرسائل مع أخصائي التغذية
			</a>
		</p>
	{/if}
	<p class="text-sm text-gray-400">
		سجّل الخروج لاحقاً من القائمة عندما تكون جاهزة — هذه صفحة مؤقتة بعد تسجيل الدخول.
	</p>
=======
<div class="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-6 py-12" dir="rtl">
	<div class="mx-auto max-w-4xl">

		<div class="fade-up mb-8 rounded-3xl bg-white/80 p-8 shadow-lg ring-1 ring-emerald-100">
			<p class="mb-2 text-sm font-medium text-emerald-600">لوحة التحكم</p>
			<h1 class="text-3xl font-bold text-gray-900">مرحباً، {data.user.name}</h1>
			<p class="mt-3 text-gray-600">
				أنت مسجّل كـ {data.user.role === 'dietitian' ? 'أخصائي تغذية' : 'مريض'}.
				ابدأ بإدخال البيانات الأساسية لإنشاء خطة غذائية مناسبة.
			</p>
		</div>

		<div class="fade-up rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
			<div class="mb-8">
				<h2 class="text-2xl font-bold text-gray-900">إنشاء خطة غذائية</h2>
				<p class="mt-2 text-sm text-gray-500">
					ادخل البيانات التالية ليتم استخدامها لاحقاً في توليد الخطة الغذائية.
				</p>
			</div>

			<form class="grid gap-5 md:grid-cols-2">
				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">اسم المريض</label>
					<input class="input-field" placeholder="ادخل اسم المريض" bind:value={name} />
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">عمر المريض</label>
					<input type="number" class="input-field" placeholder="ادخل عمر المريض" bind:value={age} />
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">جنس المريض</label>
					<div class="relative">
						<select class="select-field" bind:value={gender}>
							<option value="">اختر جنس المريض</option>
							<option>أنثى</option>
							<option>ذكر</option>
						</select>
						<div class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-400">⌄</div>
					</div>
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">هدف الخطة</label>
					<div class="relative">
						<select class="select-field" bind:value={goal}>
							<option value="">اختر هدف الخطة</option>
							<option>خسارة وزن</option>
							<option>زيادة وزن</option>
							<option>المحافظة على الوزن</option>
							<option>تحسين الصحة</option>
						</select>
						<div class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-400">⌄</div>
					</div>
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">وزن المريض</label>
					<input type="number" class="input-field" placeholder="ادخل الوزن بالكيلوغرام" bind:value={weight} />
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">طول المريض</label>
					<input type="number" class="input-field" placeholder="ادخل الطول بالسنتيمتر" bind:value={height} />
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">السعرات اليومية</label>
					<input type="number" class="input-field" placeholder="ادخل عدد السعرات اليومية" bind:value={calories} />
				</div>

				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">نوع الحمية</label>
					<div class="relative">
						<select class="select-field" bind:value={diet}>
							<option value="">اختر نوع الحمية</option>
							<option>متوازن</option>
							<option>قليل الكربوهيدرات</option>
							<option>عالي البروتين</option>
							<option>نباتي</option>
							<option>مناسب لمرضى السكري</option>
						</select>
						<div class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-400">⌄</div>
					</div>
				</div>

				<div class="md:col-span-2">
					<label class="mb-2 block text-sm font-medium text-gray-700">الحساسية والملاحظات</label>
					<textarea
						rows="4"
						class="input-field"
						placeholder="ادخل أي حساسية أو ملاحظات غذائية مهمة"
						bind:value={allergies}
					></textarea>
				</div>

				<div class="md:col-span-2 flex justify-start pt-2">
					<button type="submit" class="rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg">
						إنشاء الخطة الغذائية
					</button>
				</div>
			</form>
		</div>
	</div>
>>>>>>> c75b9e9 (Add initial meal plan inputs form)
</div>

<style>
	.input-field {
		width: 100%;
		border-radius: 0.75rem;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		padding: 0.75rem 1rem;
		outline: none;
		transition: all 0.2s ease;
	}

	.input-field:focus {
		border-color: #34d399;
		background: white;
		box-shadow: 0 0 0 4px #d1fae5;
	}

	.select-field {
		width: 100%;
		appearance: none;
		border-radius: 0.75rem;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		padding: 0.75rem 1rem 0.75rem 2.5rem;
		outline: none;
		transition: all 0.2s ease;
	}

	.select-field:focus {
		border-color: #34d399;
		background: white;
		box-shadow: 0 0 0 4px #d1fae5;
	}

	.fade-up {
		animation: fadeUp 0.6s ease both;
	}

	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>