<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>NutriCare — الرئيسية</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-6 py-16" dir="rtl">
	<h1 class="mb-2 text-2xl font-bold text-gray-900">مرحباً، {data.user.name}</h1>
	<p class="mb-8 text-gray-600">
		أنت مسجّل كـ {data.user.role === 'dietitian' ? 'أخصائي تغذية' : 'مريض'}. لوحة التحكم قيد
		الإعداد.
	</p>
	<p class="text-sm text-gray-400">
		سجّل الخروج لاحقاً من القائمة عندما تكون جاهزة — هذه صفحة مؤقتة بعد تسجيل الدخول.
	</p>
</div>
