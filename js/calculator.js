const API = 'http://localhost:8080/api';
const now = new Date();
const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', '');

let monthData = { id: null, income: 0, savingsPercent: 0 };
let allCategories = [];
let allTransactions = {};
let viewingMonth = currentMonth;
let barChartInstance = null;
let monthsList = [];


document.getElementById('current-month').textContent = '📅 ' + currentMonth;

async function init() {
    await loadMonth(currentMonth);
    await loadAllMonths();
}

async function loadMonth(monthName) {
    const res = await fetch(`${API}/dashboard/${monthName}`);
    const data = await res.json();
    monthData = { income: data.income, savingsPercent: data.savingsPercent };
    allCategories = data.categories.map(c => ({ id: c.id, name: c.name, budget: c.budget }));
    allTransactions = {};
    data.categories.forEach(c => { allTransactions[c.id] = c.transactions; });
    render();
}

async function setIncome() {
    if (viewingMonth !== currentMonth) return alert('This month is locked!');
    const income = parseFloat(document.getElementById('income-input').value);
    const savingsAmount = parseFloat(document.getElementById('savings-input').value) || 0;
    if (!income) return alert('Enter income!');
    if (savingsAmount < 0) return alert('Savings cannot be negative!');
    if (savingsAmount > income) return alert('Savings cannot be more than income!');
    const savingsPercent = parseFloat(((savingsAmount / income) * 100).toFixed(2));
    await fetch(`${API}/month/${currentMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ income, savingsPercent })
    });
    document.getElementById('income-input').value = '';
    document.getElementById('savings-input').value = '';
    await loadMonth(currentMonth);
}

async function checkOverspend(amount) {
    const income = monthData.income || 0;
    const savingsPercent = monthData.savingsPercent || 0;
    const savings = income * (savingsPercent / 100);
    const totalExpense = allCategories.reduce((sum, cat) => {
        return sum + (allTransactions[cat.id] || []).reduce((s, t) => s + t.amount, 0);
    }, 0);
    const newTotal = totalExpense + amount;
    const remaining = income - savings - newTotal;
    if (remaining < 0) {
        const needed = Math.abs(remaining);
        if (needed > savings) {
            alert(`❌ Not enough savings!\nShortfall: ₹${needed.toLocaleString()}\nAvailable savings: ₹${savings.toLocaleString()}`);
            return false;
        }
        const reduce = confirm(`⚠️ Budget will exceed!\n\nShortfall: ₹${needed.toLocaleString()}\nThis will be deducted from your savings.\n\nCurrent savings: ₹${savings.toLocaleString()}\nNew savings after deduction: ₹${(savings - needed).toLocaleString()}\n\nProceed?`);
        if (reduce) {
            const newSavings = savings - needed;
            const newPercent = parseFloat(((newSavings / income) * 100).toFixed(2));
            await fetch(`${API}/month/${currentMonth}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ income: income, savingsPercent: newPercent })
            });
            await loadMonth(currentMonth);
            return true;
        }
        return false;
    }
    return true;
}

async function addCategory() {
    if (viewingMonth !== currentMonth) return alert('This month is locked!');
    const name = document.getElementById('cat-name').value.trim();
    const budget = parseFloat(document.getElementById('cat-budget').value);
    if (!name) return alert('Enter category name!');
    if (!budget) return alert('Enter budget!');
    await fetch(`${API}/month/${currentMonth}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budget })
    });
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-budget').value = '';
    await loadMonth(currentMonth);
}

async function deleteCategory(id) {
    if (!confirm('Delete this category?')) return;
    await fetch(`${API}/categories/${id}`, { method: 'DELETE' });
    await loadMonth(currentMonth);
}

async function editCategory(id) {
    const cat = allCategories.find(c => c.id === id);
    const newName = prompt('New name:', cat.name);
    const newBudget = parseFloat(prompt('New budget:', cat.budget));
    if (!newName && !newBudget) return;
    await fetch(`${API}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName || cat.name, budget: newBudget || cat.budget })
    });
    await loadMonth(currentMonth);
}

async function downloadCSV(monthName) {
    const dash = await fetch(`${API}/dashboard/${monthName}`).then(r => r.json());
    
    let csv = 'S.No,Date,Description,Category,Amount\n';
    let sno = 1;
    
    dash.categories.forEach(cat => {
        cat.transactions.forEach(t => {
            const date = new Date(t.createdAt).toLocaleDateString();
            const desc = t.description || 'Transaction';
            csv += `${sno++},${date},"${desc}","${cat.name}",${t.amount}\n`;
        });
    });

    csv += `\nSummary\n`;
    csv += `Income,₹${dash.income}\n`;
    csv += `Total Expense,₹${dash.totalExpense}\n`;
    csv += `Savings,₹${dash.savings}\n`;
    csv += `Remaining,₹${dash.remaining}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${monthName}-expenses.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

async function addTransaction() {
    const amount = parseFloat(document.getElementById('t-amount').value);
    const catId = parseInt(document.getElementById('t-cat').value);
    const desc = document.getElementById('t-desc').value.trim() || 'Transaction';
    if (!amount) return alert('Enter amount!');
    if (!catId) return alert('Select category!');
    if (viewingMonth === currentMonth) {
        const ok = await checkOverspend(amount);
        if (!ok) return;
    }
    await fetch(`${API}/categories/${catId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, amount })
    });
    document.getElementById('t-desc').value = '';
    document.getElementById('t-amount').value = '';
    await loadMonth(viewingMonth);
}

async function deleteTransaction(id) {
    await fetch(`${API}/transactions/${id}`, { method: 'DELETE' });
    await loadMonth(viewingMonth);
}

async function loadAllMonths() {
    const res = await fetch(`${API}/months`);
    monthsList = await res.json();
    renderHistory();
}

async function switchMonth(monthName) {
    viewingMonth = monthName;
    await loadMonth(monthName);
    await loadAllMonths();
}

function toggleTheme() {
    document.body.classList.toggle('light');
}

function exportPDF() { window.print(); }

function render() {
    const income = monthData.income || 0;
    const savingsPercent = monthData.savingsPercent || 0;
    const totalExpense = allCategories.reduce((sum, cat) => {
        return sum + (allTransactions[cat.id] || []).reduce((s, t) => s + t.amount, 0);
    }, 0);
    const savings = income * (savingsPercent / 100);
    const remaining = income - savings - totalExpense;

    document.getElementById('inc').textContent = '₹' + income.toLocaleString();
    document.getElementById('exp').textContent = '₹' + totalExpense.toLocaleString();
    document.getElementById('rem').textContent = '₹' + remaining.toLocaleString();
    document.getElementById('sav').textContent = '₹' + Math.round(savings).toLocaleString();
    document.getElementById('income-display').textContent = income ?
        `Income: ₹${income.toLocaleString()} | Savings: ₹${Math.round(savings).toLocaleString()} | Remaining: ₹${remaining.toLocaleString()}` : '';

    const select = document.getElementById('t-cat');
    select.innerHTML = '<option value="">Select Category</option>';
    allCategories.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });

    const colors = ['#00ff88','#4488ff','#ffaa00','#ff4444','#aa44ff','#ff88aa','#44ffff','#ff8800'];
    const isLocked = viewingMonth !== currentMonth;

    document.getElementById('cat-blocks').innerHTML = allCategories.map((c, i) => {
        const txns = allTransactions[c.id] || [];
        const spent = txns.reduce((a, b) => a + b.amount, 0);
        const catRemaining = c.budget - spent;
        const percent = Math.min((spent / c.budget) * 100, 100).toFixed(0);
        const isOver = spent > c.budget;

        return `
        <div class="cat-block">
            <div class="cat-header">
                <span class="cat-name" style="color:${colors[i % colors.length]}">${c.name}</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <span class="cat-budget">Budget: ₹${c.budget.toLocaleString()}</span>
                    ${!isLocked ? `<div class="cat-actions">
                        <button onclick="editCategory(${c.id})">✏️</button>
                        <button onclick="deleteCategory(${c.id})">🗑️</button>
                    </div>` : ''}
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill ${percent > 80 ? 'danger' : percent > 50 ? 'warning' : 'safe'}" style="width:${percent}%"></div>
            </div>
            ${isOver ? `<div class="alert-msg">⚠️ Budget exceeded by ₹${Math.abs(catRemaining).toLocaleString()}!</div>` : ''}
            <div class="cat-stats">
                <span class="red">Spent: ₹${spent.toLocaleString()}</span>
                <span class="${catRemaining >= 0 ? 'green' : 'red'}">Remaining: ₹${catRemaining.toLocaleString()}</span>
                <span style="color:#888">${percent}% used</span>
            </div>
            <div>
                ${txns.length === 0 ? '<p style="color:#555;font-size:12px">No transactions</p>' :
                txns.map(t => `
                    <div class="t-item">
                        <div class="t-left">
                            <span class="t-desc">${t.description || 'Transaction'}</span>
                            <span class="t-date">${new Date(t.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="t-right">
                            <span class="red">-₹${t.amount.toLocaleString()}</span>
                            ${!isLocked ? `<button class="t-del" onclick="deleteTransaction(${t.id})">✕</button>` : ''}
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
    }).join('') || '<p class="empty-msg">No categories yet!</p>';

    renderChart(colors);
    renderCurrentMonthHistory();
    renderInsights();
    renderHealthScore();
    updateGoal();
}

function setGoal() {
    const goal = parseFloat(document.getElementById('goal-input').value);
    if (!goal) return alert('Enter goal amount!');
    localStorage.setItem('savingsGoal', goal);
    document.getElementById('goal-input').value = '';
    updateGoal();
}

function updateGoal() {
    const goal = parseFloat(localStorage.getItem('savingsGoal')) || 0;
    const income = monthData.income || 0;
    const savingsPercent = monthData.savingsPercent || 0;
    const savings = income * (savingsPercent / 100);
    
    const display = document.getElementById('goal-display');
    const bar = document.getElementById('goal-bar');
    if (!display || !bar) return;
    
    if (!goal) {
        display.textContent = 'No goal set';
        bar.style.width = '0%';
        return;
    }
    
    const percent = Math.min((savings / goal) * 100, 100).toFixed(0);
    display.textContent = `₹${savings.toLocaleString()} / ₹${goal.toLocaleString()} (${percent}%)`;
    bar.style.width = percent + '%';
    bar.style.background = percent >= 100 ? '#00ff88' : percent >= 50 ? '#ffaa00' : '#ff4444';
}

function renderInsights() {
    const container = document.getElementById('insights');
    if (!container) return;

    const income = monthData.income || 0;
    const savingsPercent = monthData.savingsPercent || 0;
    const savings = income * (savingsPercent / 100);
    const totalExpense = allCategories.reduce((sum, cat) => {
        return sum + (allTransactions[cat.id] || []).reduce((s, t) => s + t.amount, 0);
    }, 0);
    const remaining = income - savings - totalExpense;

    // Top spending category
    let topCat = { name: 'None', spent: 0 };
    allCategories.forEach(cat => {
        const spent = (allTransactions[cat.id] || []).reduce((a, b) => a + b.amount, 0);
        if (spent > topCat.spent) topCat = { name: cat.name, spent };
    });

    // Daily average
    const today = new Date();
    const daysGone = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - daysGone;
    const dailyAvg = daysGone > 0 ? Math.round(totalExpense / daysGone) : 0;

    // Budget health score
    const spendPercent = income > 0 ? (totalExpense / (income - savings)) * 100 : 0;
    let score, scoreColor, scoreEmoji;
    if (spendPercent <= 50) { score = 'Excellent'; scoreColor = '#00ff88'; scoreEmoji = '🟢'; }
    else if (spendPercent <= 75) { score = 'Good'; scoreColor = '#ffaa00'; scoreEmoji = '🟡'; }
    else if (spendPercent <= 90) { score = 'Warning'; scoreColor = '#ff8800'; scoreEmoji = '🟠'; }
    else { score = 'Critical'; scoreColor = '#ff4444'; scoreEmoji = '🔴'; }

    container.innerHTML = `
        <div class="insight-item">
            <span class="insight-label">🏆 Top Spending</span>
            <span class="insight-value" style="color:#ff4444">${topCat.name} — ₹${topCat.spent.toLocaleString()}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">📅 Daily Average</span>
            <span class="insight-value" style="color:#4488ff">₹${dailyAvg.toLocaleString()}/day</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">⏳ Days Left</span>
            <span class="insight-value" style="color:#ffaa00">${daysLeft} days</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">💰 Remaining</span>
            <span class="insight-value" style="${remaining >= 0 ? 'color:#00ff88' : 'color:#ff4444'}">₹${remaining.toLocaleString()}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">📊 Budget Health</span>
            <span class="insight-value" style="color:${scoreColor}">${scoreEmoji} ${score}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">🔮 Month End Prediction</span>
            <span class="insight-value" style="color:#aa44ff">₹${(dailyAvg * daysInMonth).toLocaleString()} total</span>
        </div>
    `;
}

function renderChart(colors) {
    const labels = allCategories.map(c => c.name);
    const spent = allCategories.map(c => (allTransactions[c.id] || []).reduce((a, b) => a + b.amount, 0));
    const budgets = allCategories.map(c => c.budget);
    if (barChartInstance) barChartInstance.destroy();
    if (labels.length === 0) return;
    barChartInstance = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Spent (₹)', data: spent, backgroundColor: colors.slice(0, labels.length), borderRadius: 6 },
                { label: 'Budget (₹)', data: budgets, backgroundColor: colors.slice(0, labels.length).map(c => c + '44'), borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#aaa' } } },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: '#222' } },
                y: { ticks: { color: '#aaa' }, grid: { color: '#222' } }
            }
        }
    });
}

function renderHealthScore() {
    const container = document.getElementById('health-score');
    if (!container) return;

    const income = monthData.income || 0;
    const savingsPercent = monthData.savingsPercent || 0;
    const savings = income * (savingsPercent / 100);
    const totalExpense = allCategories.reduce((sum, cat) => {
        return sum + (allTransactions[cat.id] || []).reduce((s, t) => s + t.amount, 0);
    }, 0);

    if (income === 0) {
        container.innerHTML = '<p class="empty-msg">Set income to see health score</p>';
        return;
    }

    // Score calculation
    let score = 100;
    const expenseRatio = totalExpense / (income - savings);
    if (expenseRatio > 1) score -= 40;
    else if (expenseRatio > 0.9) score -= 30;
    else if (expenseRatio > 0.75) score -= 20;
    else if (expenseRatio > 0.5) score -= 10;

    const savingsRatio = savings / income;
    if (savingsRatio >= 0.3) score += 0;
    else if (savingsRatio >= 0.2) score -= 5;
    else if (savingsRatio >= 0.1) score -= 10;
    else score -= 20;

    score = Math.max(0, Math.min(100, score));

    let color, label, msg;
    if (score >= 80) { color = '#00ff88'; label = 'Excellent 🌟'; msg = 'Great job! Keep it up!'; }
    else if (score >= 60) { color = '#ffaa00'; label = 'Good 👍'; msg = 'On track, minor improvements needed.'; }
    else if (score >= 40) { color = '#ff8800'; label = 'Fair ⚠️'; msg = 'Watch your spending habits.'; }
    else { color = '#ff4444'; label = 'Poor 🔴'; msg = 'Overspending detected! Take action.'; }

    container.innerHTML = `
        <div style="text-align:center; margin-bottom:16px">
            <div style="font-size:48px; font-weight:bold; color:${color}">${score}</div>
            <div style="font-size:16px; color:${color}; margin-top:4px">${label}</div>
            <div style="color:#888; font-size:13px; margin-top:6px">${msg}</div>
        </div>
        <div style="background:#1a1a1a; border-radius:20px; height:12px; overflow:hidden; margin-bottom:16px">
            <div style="width:${score}%; height:100%; background:${color}; border-radius:20px; transition:width 0.5s ease"></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
            <div style="background:#1a1a1a; padding:12px; border-radius:8px; text-align:center">
                <div style="color:#888; font-size:12px">Expense Ratio</div>
                <div style="font-weight:bold; color:${expenseRatio > 1 ? '#ff4444' : '#00ff88'}">${(expenseRatio * 100).toFixed(0)}%</div>
            </div>
            <div style="background:#1a1a1a; padding:12px; border-radius:8px; text-align:center">
                <div style="color:#888; font-size:12px">Savings Ratio</div>
                <div style="font-weight:bold; color:${savingsRatio >= 0.2 ? '#00ff88' : '#ffaa00'}">${(savingsRatio * 100).toFixed(0)}%</div>
            </div>
        </div>
    `;
}

function renderCurrentMonthHistory() {
    const container = document.getElementById('current-history');
    if (!container) return;
    let allTxns = [];
    allCategories.forEach(cat => {
        const txns = allTransactions[cat.id] || [];
        txns.forEach(t => { allTxns.push({ ...t, categoryName: cat.name }); });
    });
    if (allTxns.length === 0) {
        container.innerHTML = '<p class="empty-msg">No transactions this month</p>';
        return;
    }
    allTxns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    container.innerHTML = `
        <table class="history-table">
            <thead>
                <tr><th>#</th><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr>
            </thead>
            <tbody>
                ${allTxns.map((t, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td style="color:#888">${new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>${t.description || 'Transaction'}</td>
                    <td><span style="color:#4488ff">${t.categoryName}</span></td>
                    <td class="red">-₹${t.amount.toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="4" style="text-align:right;font-weight:bold;color:#888">Total:</td>
                    <td class="red">-₹${allTxns.reduce((a, b) => a + b.amount, 0).toLocaleString()}</td>
                </tr>
            </tfoot>
        </table>`;
}

function renderHistory() {
    const history = document.getElementById('history');
    const prevMonths = monthsList.filter(m => m.monthName !== currentMonth);
    if (prevMonths.length === 0) {
        history.innerHTML = '<p class="empty-msg">No previous months yet</p>';
        return;
    }
    history.innerHTML = `
        <table class="history-table">
            <thead>
                <tr><th>#</th><th>Month</th><th>Income</th><th>Savings</th><th>Total Expense</th><th>Remaining</th><th>Status</th></tr>
            </thead>
            <tbody>
                ${prevMonths.map((m, i) => {
                    const income = m.income || 0;
                    const savings = income * ((m.savingsPercent || 0) / 100);
                    return `
                    <tr onclick="switchMonth('${m.monthName}')" style="cursor:pointer" title="Click to view ${m.monthName}">
                        <td>${i + 1}</td>
                        <td><span class="blue">📅 ${m.monthName}</span></td>
                        <td class="green">₹${income.toLocaleString()}</td>
                        <td class="yellow">₹${Math.round(savings).toLocaleString()}</td>
                        <td class="red" id="hist-exp-${m.id}">...</td>
                        <td id="hist-rem-${m.id}">...</td>
                        <td>🔒 Locked</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;

    prevMonths.forEach(async m => {
        const dash = await fetch(`${API}/dashboard/${m.monthName}`).then(r => r.json());
        const expEl = document.getElementById(`hist-exp-${m.id}`);
        const remEl = document.getElementById(`hist-rem-${m.id}`);
        if (expEl) expEl.textContent = `₹${dash.totalExpense.toLocaleString()}`;
        if (remEl) {
            remEl.textContent = `₹${dash.remaining.toLocaleString()}`;
            remEl.className = dash.remaining >= 0 ? 'green' : 'red';
        }
    });
}

init();