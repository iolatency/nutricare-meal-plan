<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showCreateModal = $state(false);
</script>

<svelte:head><title>المكملات الغذائية — نيوتريكير</title></svelte:head>

<div class="page">
	<div
		style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px;"
	>
		<div>
			<h1 style="font-size:22px; font-weight:700; color:#1a1d23; margin:0 0 3px;">
				المكملات الغذائية
			</h1>
			<p style="font-size:13px; color:#8b909a; margin:0;">
				{data.supplements.length} منتج في قاعدة البيانات
			</p>
		</div>
		<button class="btn-primary" onclick={() => (showCreateModal = true)}>
			<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2.5"
					d="M12 4v16m8-8H4"
				/>
			</svg>
			إضافة مكمل
		</button>
	</div>

	<!-- Info banner -->
	<div
		style="background:#f0ebff; border:1px solid #d8c8f5; border-radius:10px; padding:14px 18px; margin-bottom:20px; display:flex; align-items:flex-start; gap:10px;"
	>
		<svg
			width="18"
			height="18"
			fill="none"
			stroke="#7c5cbf"
			viewBox="0 0 24 24"
			style="flex-shrink:0; margin-top:1px;"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
			/>
		</svg>
		<p style="font-size:13px; color:#5b3fa0; margin:0; line-height:1.5;">
			قاعدة بيانات المكملات الغذائية السريرية — تشمل منتجات Ensure وGlucerna وNepro وFresubin
			وNutrison وغيرها. جميع القيم الغذائية معتمدة من الشركات المصنعة.
		</p>
	</div>

	<!-- Search -->
	<form method="GET" style="margin-bottom:16px;">
		<div style="position:relative;">
			<svg
				style="position:absolute; right:13px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:#8b909a;"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
				/>
			</svg>
			<input
				type="text"
				name="q"
				value={data.q}
				placeholder="ابحث عن مكمل غذائي..."
				class="input"
				style="padding-right:42px; max-width:400px;"
			/>
		</div>
	</form>

	{#if form?.error}
		<div
			style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:13px;"
		>
			{form.error}
		</div>
	{/if}

	<div class="table-wrap">
		<div style="overflow-x:auto;">
			<table>
				<thead>
					<tr>
						<th>المنتج</th>
						<th style="text-align:center;">kcal/mL</th>
						<th style="text-align:center;">إجمالي kcal</th>
						<th style="text-align:center;">الحجم (mL)</th>
						<th style="text-align:center; color:#7c5cbf;">بروتين (g)</th>
						<th style="text-align:center; color:#3cb96b;">كارب (g)</th>
						<th style="text-align:center; color:#f59e0b;">دهون (g)</th>
						<th style="text-align:center;">أوزمولالية</th>
						<th style="text-align:center;">المرجع</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.supplements as s}
						<tr>
							<td>
								<p
									style="font-weight:600; color:#1a1d23; margin:0; max-width:220px; white-space:normal; line-height:1.3;"
								>
									{s.name}
								</p>
							</td>
							<td style="text-align:center;">
								{#if s.kcalPerMl}
									<span
										style="background:#edf9f2; color:#3cb96b; padding:2px 8px; border-radius:8px; font-size:12px; font-weight:600;"
										>{s.kcalPerMl}</span
									>
								{:else}—{/if}
							</td>
							<td style="text-align:center; font-weight:600;">{s.totalKcal ?? '—'}</td>
							<td style="text-align:center; color:#6b7280;">{s.volumeMl ?? '—'}</td>
							<td style="text-align:center;"
								><span class="macro-val" style="color:#7c5cbf;">{s.protein ?? '—'}</span></td
							>
							<td style="text-align:center;"
								><span class="macro-val" style="color:#3cb96b;">{s.carbs ?? '—'}</span></td
							>
							<td style="text-align:center;"
								><span class="macro-val" style="color:#f59e0b;">{s.fat ?? '—'}</span></td
							>
							<td style="text-align:center; color:#6b7280; font-size:12px;"
								>{s.osmolarity ?? s.osmolality ?? '—'}</td
							>
							<td style="text-align:center;">
								{#if s.reference}
									<a
										href={s.reference}
										target="_blank"
										rel="noopener noreferrer"
										style="font-size:11.5px; color:#7c5cbf; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"
									>
										<svg
											width="12"
											height="12"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
											/></svg
										>
										مرجع
									</a>
								{:else}
									<span style="color:#d1d5db; font-size:12px;">—</span>
								{/if}
							</td>
							<td style="text-align:center;">
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={s.id} />
									<button
										type="submit"
										style="background:none; border:none; cursor:pointer; color:#e2e8f0; padding:4px; transition:color .15s;"
										onmouseenter={(e) =>
											((e.currentTarget as HTMLButtonElement).style.color = '#ef4444')}
										onmouseleave={(e) =>
											((e.currentTarget as HTMLButtonElement).style.color = '#e2e8f0')}
										title="حذف"
									>
										<svg
											width="15"
											height="15"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</form>
							</td>
						</tr>
					{:else}
						<tr>
							<td
								colspan="10"
								style="text-align:center; padding:40px; color:#8b909a; font-size:13px;"
							>
								{data.q ? `لا توجد نتائج لـ "${data.q}"` : 'لا توجد مكملات في قاعدة البيانات'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- Add Supplement Modal -->
{#if showCreateModal}
	<div
		class="modal-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="supplement-create-modal-title"
		tabindex="-1"
		onclick={(e) => e.target === e.currentTarget && (showCreateModal = false)}
		onkeydown={(e) => {
			if (e.key === 'Escape') showCreateModal = false;
			if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
				e.preventDefault();
				showCreateModal = false;
			}
		}}
	>
		<div class="modal">
			<div
				style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;"
			>
				<h2
					id="supplement-create-modal-title"
					style="font-size:17px; font-weight:700; color:#1a1d23; margin:0;"
				>
					إضافة مكمل جديد
				</h2>
				<button
					type="button"
					aria-label="إغلاق"
					onclick={() => (showCreateModal = false)}
					style="background:none; border:none; cursor:pointer; color:#8b909a;"
				>
					<svg
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
			<form
				method="POST"
				action="?/create"
				use:enhance
				onsubmit={() => (showCreateModal = false)}
				style="display:flex; flex-direction:column; gap:14px;"
			>
				<div>
					<label class="form-label" for="supp-create-name">اسم المنتج *</label>
					<input
						id="supp-create-name"
						name="name"
						type="text"
						required
						class="input"
						placeholder="مثال: Ensure 1kcal/mL (Abbott)"
					/>
				</div>
				<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
					<div>
						<label class="form-label" for="supp-create-kcalPerMl">kcal/mL</label><input
							id="supp-create-kcalPerMl"
							name="kcalPerMl"
							type="number"
							step="0.01"
							class="input"
							dir="ltr"
						/>
					</div>
					<div>
						<label class="form-label" for="supp-create-totalKcal">إجمالي kcal</label><input
							id="supp-create-totalKcal"
							name="totalKcal"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
					<div>
						<label class="form-label" for="supp-create-volumeMl">الحجم (mL)</label><input
							id="supp-create-volumeMl"
							name="volumeMl"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
				</div>
				<p
					style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; margin:2px 0 0;"
				>
					المغذيات الكبرى (g)
				</p>
				<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
					<div>
						<label class="form-label" for="supp-create-protein">بروتين</label><input
							id="supp-create-protein"
							name="protein"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
					<div>
						<label class="form-label" for="supp-create-carbs">كربوهيدرات</label><input
							id="supp-create-carbs"
							name="carbs"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
					<div>
						<label class="form-label" for="supp-create-fat">دهون</label><input
							id="supp-create-fat"
							name="fat"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
				</div>
				<p
					style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; margin:2px 0 0;"
				>
					المعادن (mg)
				</p>
				<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
					<div>
						<label class="form-label" for="supp-create-sodium">صوديوم</label><input
							id="supp-create-sodium"
							name="sodium"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
					<div>
						<label class="form-label" for="supp-create-potassium">بوتاسيوم</label><input
							id="supp-create-potassium"
							name="potassium"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
					<div>
						<label class="form-label" for="supp-create-calcium">كالسيوم</label><input
							id="supp-create-calcium"
							name="calcium"
							type="number"
							step="0.1"
							class="input"
							dir="ltr"
						/>
					</div>
				</div>
				<div>
					<label class="form-label" for="supp-create-osmolarity">الأوزمولالية (mOsm/L)</label>
					<input
						id="supp-create-osmolarity"
						name="osmolarity"
						type="number"
						step="1"
						class="input"
						dir="ltr"
					/>
				</div>
				<div>
					<label class="form-label" for="supp-create-reference">المرجع (رابط)</label>
					<input
						id="supp-create-reference"
						name="reference"
						type="url"
						class="input"
						placeholder="https://..."
						dir="ltr"
					/>
				</div>
				<div style="display:flex; gap:8px; margin-top:4px;">
					<button
						type="button"
						onclick={() => (showCreateModal = false)}
						style="flex:1; background:#fff; color:#4b5563; border:1px solid #e8eaed; border-radius:8px; padding:10px; font-size:13.5px; cursor:pointer; font-family:'Tajawal',sans-serif;"
						>إلغاء</button
					>
					<button type="submit" class="btn-primary" style="flex:1; justify-content:center;"
						>حفظ المكمل</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 24px 32px;
		max-width: 1100px;
		margin: 0 auto;
		font-family: 'Tajawal', sans-serif;
	}
	.btn-primary {
		background: #3cb96b;
		color: #fff;
		border: none;
		border-radius: 8px;
		padding: 9px 18px;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		transition: all 0.15s;
		font-family: 'Tajawal', sans-serif;
	}
	.btn-primary:hover {
		background: #2ea55d;
	}
	.table-wrap {
		background: #fff;
		border-radius: 12px;
		border: 1px solid #e8eaed;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		overflow: hidden;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
	}
	th {
		text-align: right;
		padding: 10px 14px;
		font-weight: 600;
		font-size: 11.5px;
		color: #6b7280;
		background: #fafafa;
		border-bottom: 1px solid #e8eaed;
		white-space: nowrap;
	}
	td {
		padding: 10px 14px;
		border-bottom: 1px solid #f4f6f9;
		color: #1a1d23;
	}
	tr:last-child td {
		border-bottom: none;
	}
	tr:hover td {
		background: #fafffe;
	}
	.input {
		width: 100%;
		border: 1px solid #e8eaed;
		border-radius: 8px;
		padding: 9px 13px;
		font-size: 14px;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		box-sizing: border-box;
		transition: border 0.15s;
	}
	.input:focus {
		border-color: #3cb96b;
	}
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 16px;
	}
	.modal {
		background: #fff;
		border-radius: 16px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
		width: 100%;
		max-width: 560px;
		padding: 28px;
		font-family: 'Tajawal', sans-serif;
		max-height: 90vh;
		overflow-y: auto;
	}
	.form-label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 5px;
	}
	.macro-val {
		font-weight: 600;
		font-size: 12.5px;
	}
</style>
