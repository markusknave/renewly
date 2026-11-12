// Insights screen: local-only analysis, forecast chart, and the offline chat.

import { formatMoney } from '../lib/dates.js';
import { SUGGESTED_PROMPTS } from '../insights.js';
import { esc, icon, progressBar } from './shared.js';

function forecastChart(series) {
	const points = series || [];
	if (!points.length) return '';
	const width = 720;
	const height = 180;
	const max = Math.max(1, ...points.map((point) => point.amountCents));
	const step = points.length > 1 ? width / (points.length - 1) : width;
	const coords = points.map((point, index) => ({
		x: index * step,
		y: height - 18 - (point.amountCents / max) * (height - 34),
		projected: point.projected,
		date: point.date,
	}));
	const actual = coords.filter((point) => !point.projected);
	const projected = coords.filter((point) => point.projected);
	const line = (rows) => `M${rows.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L')}`;
	const actualPath = actual.length ? line(actual) : '';
	const projectedPath = projected.length
		? line([actual.at(-1), ...projected].filter(Boolean))
		: '';
	const areaPath = actual.length ? `${actualPath} L${actual.at(-1).x.toFixed(1)},${height} L0,${height} Z` : '';
	const todayX = actual.length ? actual.at(-1).x : 0;

	return `<svg class="forecast-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Daily spending for the last 30 days and a 30-day forecast">
		<defs>
			<linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28"/>
				<stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
			</linearGradient>
		</defs>
		<path class="forecast-area" d="${areaPath}" fill="url(#forecastFill)"/>
		<path class="forecast-line" d="${actualPath}"/>
		<path class="forecast-line projected" d="${projectedPath}"/>
		<line class="forecast-today" x1="${todayX}" y1="0" x2="${todayX}" y2="${height - 18}"/>
		<text class="forecast-label" x="${Math.max(2, todayX - 14)}" y="${height - 4}">today</text>
		<text class="forecast-label" x="0" y="${height - 4}">${esc(points[0].date.slice(5))}</text>
		<text class="forecast-label" x="${width - 52}" y="${height - 4}">${esc(points.at(-1).date.slice(5))}</text>
	</svg>`;
}

function tipIcon(tone) {
	if (tone === 'warn') return icon('trendUp');
	if (tone === 'ok') return icon('check');
	return icon('sparkles');
}

function tipList(tips) {
	if (!tips.length) return '<p class="muted small">Not enough data yet for recommendations.</p>';
	return `<ul class="tip-list">${tips
		.map(
			(tip) => `<li class="tip tip-${esc(tip.tone)}">
				<span class="tip-icon">${tipIcon(tip.tone)}</span>
				<div><strong>${esc(tip.title)}</strong><p>${esc(tip.body)}</p></div>
			</li>`
		)
		.join('')}</ul>`;
}

function goalFeasibility(goalRows) {
	if (!goalRows.length) return '<p class="muted small">No goals yet. Create one on the Goals tab to see feasibility here.</p>';
	return `<ul class="feasibility">${goalRows
		.map(
			(row) => `<li>
				<div class="feasibility-head">
					<strong>${esc(row.goal.name)}</strong>
					<span class="pill ${row.complete ? 'pill-active' : row.feasible ? 'pill-trial' : 'pill-paused'}">${
						row.complete ? 'Complete' : row.feasible ? 'On track' : 'Behind'
					}</span>
				</div>
				${progressBar(row.progress, `var(--goal-${row.goal.color || 'indigo'})`)}
				<p class="sub">${esc(formatMoney(row.savedCents, 'PHP'))} of ${esc(
					formatMoney(row.targetCents, 'PHP')
				)}${
					row.goal.deadline
						? ` · needs ${esc(formatMoney(row.requiredMonthlyCents, 'PHP'))}/mo, pace ${esc(
								formatMoney(row.averageMonthlyCents, 'PHP')
							)}/mo`
						: row.projectedDate
							? ` · projected ${esc(row.projectedDate)}`
							: ''
				}</p>
			</li>`
		)
		.join('')}</ul>`;
}

function categoryList(categories, totalCents) {
	if (!categories.length) return '<p class="muted small">No expenses this month yet.</p>';
	return `<ul class="category-list">${categories
		.slice(0, 6)
		.map(
			(category) => `<li>
				<span class="legend-dot" style="--cat:${category.color}"></span>
				<span class="legend-name">${esc(category.label)}</span>
				<span class="legend-value">${esc(formatMoney(category.amountCents, 'PHP'))}</span>
				<span class="legend-share">${Math.round(category.share)}%</span>
			</li>`
		)
		.join('')}</ul>`;
}

function chatLog(chat) {
	if (!chat.length) {
		return `<div class="chat-empty">
			<p class="muted small">Ask about this device's records. Nothing is sent anywhere and the history disappears when the app closes.</p>
		</div>`;
	}
	return chat
		.map(
			(message) => `<div class="chat-message chat-${message.role}">
				<div class="chat-bubble">${esc(message.text).replace(/\n/g, '<br />')}</div>
			</div>`
		)
		.join('');
}

export function insightsView({ insights, goalRows = [], chat = [], methods = [] }) {
	const month = insights.month;
	const topCategory = insights.topCategory;
	return `<div class="page-head">
		<div><p class="eyebrow">Insights</p><h1>Your local analyst</h1><p class="muted">Recommendations and forecasts computed from this device's records. No internet, no learning, no data collection.</p></div>
	</div>

	<section class="privacy-banner">
		<span class="privacy-icon">${icon('shield')}</span>
		<div>
			<strong>Private by construction</strong>
			<p class="muted small">The analyst reads only Renewly's own ledger. It cannot browse, call APIs, open other apps, or train on your data. Chat messages live in memory and are gone when the app closes.</p>
		</div>
	</section>

	<section class="stat-row">
		<div class="mini-stat">
			<span class="mini-stat-icon spend">${icon('arrowUp')}</span>
			<span class="mini-stat-label">This month</span>
			<strong>${esc(formatMoney(month.expenseCents, 'PHP'))}</strong>
			<span class="mini-stat-sub">${month.count} expenses · ${
				insights.changePct === null
					? 'no baseline'
					: `${insights.changePct >= 0 ? 'up' : 'down'} ${Math.abs(insights.changePct).toFixed(1)}% vs last month`
			}</span>
		</div>
		<div class="mini-stat">
			<span class="mini-stat-icon daily">${icon('calendar')}</span>
			<span class="mini-stat-label">Daily average</span>
			<strong>${esc(formatMoney(Math.round(insights.dailyAvgCents), 'PHP'))}</strong>
			<span class="mini-stat-sub">Last 30 days</span>
		</div>
		<div class="mini-stat">
			<span class="mini-stat-icon interest">${icon('trendUp')}</span>
			<span class="mini-stat-label">Projected month</span>
			<strong>${esc(formatMoney(insights.projectedMonthCents, 'PHP'))}</strong>
			<span class="mini-stat-sub">Straight-line estimate</span>
		</div>
		<div class="mini-stat">
			<span class="mini-stat-icon subs">${icon('refresh')}</span>
			<span class="mini-stat-label">Top category</span>
			<strong>${esc(topCategory ? topCategory.label : 'No data')}</strong>
			<span class="mini-stat-sub">${
				topCategory ? `${esc(formatMoney(topCategory.amountCents, 'PHP'))} · ${Math.round(topCategory.share)}%` : 'Add expenses to see this'
			}</span>
		</div>
	</section>

	<div class="insight-grid">
		<section class="panel">
			<div class="panel-head">
				<h2>Spending shape</h2>
				<span class="muted small">Last 30 days + 30-day forecast</span>
			</div>
			${forecastChart(insights.forecast.series)}
			<div class="forecast-legend">
				<span><i class="line-solid"></i> Actual</span>
				<span><i class="line-dashed"></i> Projected</span>
				<span class="muted">Next 30 days: ${esc(formatMoney(insights.forecast.next30Cents, 'PHP'))}</span>
			</div>
			${categoryList(month.categories, month.expenseCents)}
		</section>

		<section class="panel">
			<div class="panel-head"><h2>What stands out</h2><span class="muted small">Rules, not a black box</span></div>
			${tipList(insights.tips)}
		</section>

		<section class="panel">
			<div class="panel-head"><h2>Goal feasibility</h2><a class="link" href="#/goals">Open goals</a></div>
			${goalFeasibility(goalRows)}
		</section>

		<section class="panel">
			<div class="panel-head"><h2>Money snapshot</h2></div>
			<ul class="snapshot-list">
				<li><span>Total available</span><strong>${esc(formatMoney(insights.balanceCents, 'PHP'))}</strong></li>
				<li><span>Interest earned</span><strong>${esc(formatMoney(insights.earnedInterestCents, 'PHP'))}</strong></li>
				<li><span>Interest accruing</span><strong>${esc(formatMoney(insights.pendingInterestCents, 'PHP'))}</strong></li>
				<li><span>Subscriptions / month</span><strong>${esc(
					formatMoney(insights.subscriptionMonthlyCents, 'PHP')
				)}</strong></li>
				<li><span>Payment methods</span><strong>${methods.length}</strong></li>
			</ul>
		</section>
	</div>

	<section class="panel chat-panel">
		<div class="panel-head">
			<h2>Ask your money</h2>
			<span class="privacy-chip">${icon('shield')} Offline</span>
		</div>
		<div class="chat-log" id="chat-log" aria-live="polite">${chatLog(chat)}</div>
		<form class="chat-form" data-form="chat">
			<input type="text" name="message" autocomplete="off" maxlength="240" placeholder="e.g. how much did I spend on food last month?" aria-label="Ask the analyst" />
			<button class="btn btn-primary" type="submit">Ask</button>
		</form>
		<div class="chat-chips">${SUGGESTED_PROMPTS.map(
			(prompt) => `<button class="chip" type="button" data-chat-prompt="${esc(prompt)}">${esc(prompt)}</button>`
		).join('')}</div>
	</section>`;
}
