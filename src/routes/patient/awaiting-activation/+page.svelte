<svelte:head>
	<title>في انتظار التفعيل — نيوتريكير</title>
</svelte:head>

<div class="wrap" dir="rtl">
	<div class="card">
		<div class="icon" aria-hidden="true">
			<svg
				width="40"
				height="40"
				fill="none"
				stroke="#2a9d62"
				stroke-width="1.5"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
				/>
			</svg>
		</div>
		<h1 class="title">حسابك قيد المراجعة</h1>
		<p class="lead">
			لا يمكن استخدام لوحة المريض حتى يفعّل أخصائي التغذية حسابك ويربطه بعيادته. إذا كان لديك بريد
			مسجّل لدى أخصائي التغذية، سيقوم بالتفعيل من لوحته.
		</p>
		<p class="hint">بعد التفعيل، حدّث الصفحة أو سجّل الخروج ثم الدخول مرة أخرى إذا لزم الأمر.</p>
		<form method="POST" action="/logout" class="actions">
			<button type="submit" class="btn-secondary">تسجيل الخروج</button>
		</form>
	</div>
</div>

<style>
	.wrap {
		min-height: 60vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		font-family: 'Tajawal', sans-serif;
		background: #f6f8f7;
	}
	.card {
		max-width: 420px;
		background: #fff;
		border: 1px solid #e8eaed;
		border-radius: 16px;
		padding: 28px 24px 24px;
		text-align: center;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
	}
	.icon {
		width: 72px;
		height: 72px;
		margin: 0 auto 16px;
		border-radius: 50%;
		background: linear-gradient(135deg, #edf9f2, #d1fae5);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.title {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 1.35rem;
		font-weight: 700;
		color: #121816;
		margin: 0 0 12px;
	}
	.lead {
		font-size: 14px;
		line-height: 1.65;
		color: #5c6560;
		margin: 0 0 12px;
	}
	.hint {
		font-size: 12px;
		color: #8b909a;
		margin: 0 0 20px;
		line-height: 1.5;
	}
	.actions {
		margin: 0;
	}
	.btn-secondary {
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		padding: 10px 20px;
		border-radius: 10px;
		border: 1px solid #e8eaed;
		background: #f9fafb;
		color: #374151;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-secondary:hover {
		background: #f0f2f5;
	}
</style>
