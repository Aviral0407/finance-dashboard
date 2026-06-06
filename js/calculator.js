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