/* ==========================================================
   FinançasFácil – app.js
   Lógica completa do aplicativo de controle financeiro
   Autor: FinançasFácil Team
   Tecnologia: Vanilla JavaScript + Chart.js + localStorage
   ========================================================== */

'use strict';

// =============================================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
//    Todos os dados ficam aqui e são espelhados no localStorage
// =============================================================
let state = {
  salary: 0,            // Salário mensal líquido
  benefits: [],         // Benefícios: [{ id, name, value }]
  expenses: [],         // Array de despesas
  darkMode: false,      // Modo escuro ligado/desligado
  onboarded: false,     // Se o usuário já configurou o salário
  filter: 'mes',        // Filtro ativo na aba de despesas
  goal: null            // Meta de economia { name, target, saved }
};

// Instâncias dos gráficos Chart.js (para poder destruir antes de recriar)
let chartPie  = null;
let chartBar  = null;

// Aba ativa no momento
let activeTab = 'dashboard';

// =============================================================
// 2. PERSISTÊNCIA – localStorage
//    Salva e carrega o estado automaticamente
// =============================================================

/** Salva o estado no localStorage */
function saveState() {
  localStorage.setItem('financasfacil_state', JSON.stringify(state));
}

/** Carrega o estado do localStorage (chamado ao iniciar o app) */
function loadState() {
  const raw = localStorage.getItem('financasfacil_state');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    } catch (e) {
      console.warn('Erro ao carregar dados salvos:', e);
    }
  }
}

// =============================================================
// 3. CÁLCULOS FINANCEIROS
//    Funções puras que recebem dados e retornam resultados
// =============================================================

/** Filtra despesas pelo período selecionado */
function filterExpensesByPeriod(expenses, filter) {
  const now  = new Date();
  const today = toDateStr(now);

  // Início da semana (domingo)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfWeekStr = toDateStr(startOfWeek);

  // Início do mês
  const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  return expenses.filter(e => {
    if (!e.date) return true; // Sem data: sempre inclui

    if (filter === 'dia')    return e.date === today;
    if (filter === 'semana') return e.date >= startOfWeekStr && e.date <= today;
    if (filter === 'mes')    return e.date >= startOfMonthStr && e.date <= today;
    return true; // 'tudo'
  });
}

/** Soma os valores de um array de despesas */
function sumExpenses(expenses) {
  return expenses.reduce((acc, e) => acc + Number(e.value), 0);
}

/** Retorna a renda total: salário + todos os benefícios */
function totalIncome() {
  const benefitsTotal = (state.benefits || []).reduce((acc, b) => acc + Number(b.value), 0);
  return state.salary + benefitsTotal;
}

/** Calcula a distribuição por categoria (para regra 50/30/20) */
function calcDistribution(expenses) {
  const dist = { necessidade: 0, desejo: 0, economia: 0 };
  expenses.forEach(e => {
    if (dist[e.category] !== undefined) dist[e.category] += Number(e.value);
  });
  return dist;
}

/** Determina a saúde financeira com base no percentual gasto */
function getHealthStatus(spent, income) {
  if (income <= 0) return 'green';
  const pct = spent / income;
  if (pct < 0.70) return 'green';
  if (pct < 0.90) return 'yellow';
  return 'red';
}

/** Formata um número como moeda brasileira: R$ 1.234,56 */
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(value);
}

/** Converte um objeto Date em string YYYY-MM-DD */
function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

/** Formata data YYYY-MM-DD para exibição: "15 de março" */
function formatDateDisplay(dateStr) {
  if (!dateStr) return 'Sem data';
  const [y, m, d] = dateStr.split('-');
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${d} de ${months[parseInt(m,10)-1]}`;
}

/** Gera um ID único simples */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// =============================================================
// 4. MOTOR DE DICAS INTELIGENTES
//    Analisa os dados e gera alertas e sugestões automáticas
// =============================================================

/**
 * Gera array de dicas com base no estado atual.
 * Cada dica tem: { type: 'success'|'warning'|'danger'|'info', icon, text }
 */
function generateTips(salary, expenses) {
  const tips   = [];
  const income = totalIncome();
  if (income <= 0) return tips;

  // Despesas do mês atual
  const monthExpenses = filterExpensesByPeriod(expenses, 'mes');
  const totalSpent    = sumExpenses(monthExpenses);
  const balance       = income - totalSpent;
  const pctSpent      = totalSpent / income;
  const dist          = calcDistribution(monthExpenses);

  // ----- Alertas de saldo -----

  if (totalSpent > income) {
    tips.push({
      type: 'danger', icon: '⚠️',
      text: `Você está gastando ${formatCurrency(totalSpent - income)} a mais do que recebe! Revise suas despesas urgentemente.`
    });
  } else if (pctSpent >= 0.9) {
    tips.push({
      type: 'danger', icon: '🔴',
      text: `Atenção: você já usou ${Math.round(pctSpent * 100)}% da sua renda. Restam apenas ${formatCurrency(balance)}.`
    });
  } else if (pctSpent >= 0.7) {
    tips.push({
      type: 'warning', icon: '🟡',
      text: `Você gastou ${Math.round(pctSpent * 100)}% da renda. Fique de olho para não estourar o orçamento.`
    });
  } else {
    tips.push({
      type: 'success', icon: '✅',
      text: `Ótimo! Você ainda tem ${formatCurrency(balance)} disponível este mês.`
    });
  }

  // ----- Projeção do fim do mês -----
  const today    = new Date();
  const daysInMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysPassed   = today.getDate();
  const daysLeft     = daysInMonth - daysPassed;

  if (daysPassed > 0 && totalSpent > 0) {
    const dailyAvg  = totalSpent / daysPassed;
    const projected = dailyAvg * daysInMonth;

    if (projected > income) {
      const excess = projected - income;
      tips.push({
        type: 'warning', icon: '📈',
        text: `Se continuar nesse ritmo, vai faltar ${formatCurrency(excess)} no fim do mês. Gasto médio diário: ${formatCurrency(dailyAvg)}.`
      });
    }
  }

  // ----- Regra 50/30/20 -----
  const idealNecessidade = income * 0.50;
  const idealDesejo      = income * 0.30;
  const idealEconomia    = income * 0.20;

  if (dist.necessidade > idealNecessidade * 1.1) {
    tips.push({
      type: 'warning', icon: '🏠',
      text: `Suas necessidades (${formatCurrency(dist.necessidade)}) estão acima dos 50% ideais (${formatCurrency(idealNecessidade)}). Tente reduzir gastos fixos.`
    });
  }

  if (dist.desejo > idealDesejo * 1.1) {
    tips.push({
      type: 'warning', icon: '🎉',
      text: `Seus gastos com lazer/desejos (${formatCurrency(dist.desejo)}) estão altos. O ideal é no máximo ${formatCurrency(idealDesejo)} (30% da renda).`
    });
  }

  // ----- Sugestão de poupança -----
  if (dist.economia < idealEconomia * 0.5 && balance > 0) {
    const suggestion = Math.min(balance * 0.5, idealEconomia);
    tips.push({
      type: 'info', icon: '💡',
      text: `Sugestão: guarde ${formatCurrency(suggestion)} este mês (20% da renda = ${formatCurrency(idealEconomia)}). Pequenos hábitos fazem grande diferença!`
    });
  }

  // ----- Lembrete de reserva de emergência -----
  const totalSaved = state.goal ? state.goal.saved : 0;
  const emergencyTarget = income * 6;
  if (totalSaved < emergencyTarget && daysLeft <= 5) {
    tips.push({
      type: 'info', icon: '🛡️',
      text: `Reserva de emergência ideal: ${formatCurrency(emergencyTarget)} (6 meses de renda). Que tal começar a guardar hoje?`
    });
  }

  return tips;
}

// =============================================================
// 5. RENDERIZAÇÃO DA INTERFACE
//    Funções que atualizam o DOM com os dados do estado
// =============================================================

/** Atualiza toda a aba Dashboard */
function renderDashboard() {
  const income        = totalIncome();
  const monthExpenses = filterExpensesByPeriod(state.expenses, 'mes');
  const totalSpent    = sumExpenses(monthExpenses);
  const balance       = income - totalSpent;
  const pct           = income > 0 ? Math.min((totalSpent / income) * 100, 100) : 0;
  const status        = getHealthStatus(totalSpent, income);
  const fixedCount    = monthExpenses.filter(e => e.type === 'fixa').length;
  const varCount      = monthExpenses.filter(e => e.type === 'variavel').length;

  // Card de saúde financeira
  const card = document.getElementById('card-health');
  card.className = `rounded-2xl p-5 text-white shadow-lg health-${status}`;

  document.getElementById('txt-balance').textContent        = formatCurrency(balance);
  document.getElementById('txt-spent').textContent          = formatCurrency(totalSpent);
  document.getElementById('txt-salary').textContent         = formatCurrency(income);
  document.getElementById('txt-spent-pct').textContent      = Math.round(pct);
  document.getElementById('txt-total-expenses').textContent = formatCurrency(totalSpent);
  document.getElementById('txt-fixed-var').textContent      = `${fixedCount} / ${varCount}`;

  // Rótulo da barra: "Renda total" quando há benefícios
  const hasBenefits = (state.benefits || []).length > 0;
  document.getElementById('txt-salary-label').textContent = hasBenefits ? 'Renda total' : 'Salário';

  // Barra de progresso
  document.getElementById('salary-progress-bar').style.width = pct + '%';

  // Badge de saúde
  const badge = document.getElementById('health-badge');
  const healthLabels = { green: '● Saúde OK', yellow: '● Atenção', red: '● Risco' };
  badge.textContent = healthLabels[status];

  // Card de renda (salário + benefícios)
  renderIncomeCard();

  // Regra 50/30/20
  renderRule5030(monthExpenses);

  // Dicas
  renderTips();

  // Despesas recentes no dashboard
  renderRecentExpenses();
}

/** Renderiza o card de renda detalhada (salário + benefícios) no dashboard */
function renderIncomeCard() {
  const container = document.getElementById('income-breakdown');
  if (!container) return;

  const benefits = state.benefits || [];
  const benefitsTotal = benefits.reduce((a, b) => a + Number(b.value), 0);

  let html = `
    <div class="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700">
      <div class="flex items-center gap-2">
        <span class="text-base">💼</span>
        <span class="text-sm text-gray-700 dark:text-gray-300">Salário</span>
      </div>
      <span class="text-sm font-bold text-gray-800 dark:text-white">${formatCurrency(state.salary)}</span>
    </div>
  `;

  benefits.forEach(b => {
    html += `
      <div class="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="text-base">${getBenefitEmoji(b.name)}</span>
          <span class="text-sm text-gray-700 dark:text-gray-300 truncate">${escapeHtml(b.name)}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-sm font-bold text-green-600 dark:text-green-400">+${formatCurrency(b.value)}</span>
          <button onclick="deleteBenefit('${b.id}')"
            class="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition">
            <i data-lucide="x" class="w-3 h-3 text-gray-400"></i>
          </button>
        </div>
      </div>
    `;
  });

  if (benefitsTotal > 0) {
    html += `
      <div class="flex justify-between items-center pt-2">
        <span class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</span>
        <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">${formatCurrency(totalIncome())}</span>
      </div>
    `;
  }

  container.innerHTML = html;
  lucide.createIcons();
}

/** Renderiza as últimas despesas na tela inicial */
function renderRecentExpenses() {
  const container = document.getElementById('recent-expenses');
  if (!container) return;

  const recent = [...state.expenses]
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    })
    .slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = `
      <p class="text-sm text-gray-400 text-center py-4">Nenhuma despesa ainda. Adicione a primeira!</p>
    `;
    return;
  }

  container.innerHTML = recent.map(e => `
    <div class="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${getCategoryBg(e.category)}">
        <span class="text-sm">${getCategoryEmoji(e.category)}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800 dark:text-white truncate">${escapeHtml(e.name)}</p>
        <p class="text-xs text-gray-400">${formatDateDisplay(e.date)} · <span class="badge-${e.category} px-1.5 py-0.5 rounded-full font-medium">${categoryLabel(e.category)}</span></p>
      </div>
      <p class="text-sm font-bold text-red-500 flex-shrink-0">${formatCurrency(e.value)}</p>
    </div>
  `).join('');
}

/** Renderiza as barras da Regra 50/30/20 */
function renderRule5030(expenses) {
  const dist    = calcDistribution(expenses);
  const income  = totalIncome();
  const items   = [
    { label: 'Necessidades', key: 'necessidade', ideal: 0.50, color: '#3b82f6' },
    { label: 'Desejos',      key: 'desejo',      ideal: 0.30, color: '#8b5cf6' },
    { label: 'Economias',    key: 'economia',     ideal: 0.20, color: '#22c55e' }
  ];

  const container = document.getElementById('rule-5030-20');
  container.innerHTML = items.map(item => {
    const actual  = dist[item.key];
    const ideal   = income * item.ideal;
    const pct     = income > 0 ? Math.min((actual / income) * 100, 100) : 0;
    const idealPct = item.ideal * 100;
    const over    = actual > ideal * 1.05;
    const under   = actual < ideal * 0.8 && item.key === 'economia';

    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="font-medium text-gray-700 dark:text-gray-300">
            ${item.label}
            <span class="ml-1 opacity-60">(ideal: ${idealPct}%)</span>
          </span>
          <span class="${over ? 'text-red-500 font-bold' : under ? 'text-yellow-500 font-bold' : 'text-gray-500'}">
            ${formatCurrency(actual)} / ${formatCurrency(ideal)}
          </span>
        </div>
        <div class="rule-bar-track">
          <div class="rule-bar-fill" style="width:${pct}%; background:${over ? '#ef4444' : item.color}"></div>
        </div>
      </div>
    `;
  }).join('');
}

/** Renderiza as dicas inteligentes */
function renderTips() {
  const tips = generateTips(state.salary, state.expenses);
  const container = document.getElementById('tips-section');

  container.innerHTML = tips.map(tip => `
    <div class="tip-card tip-${tip.type} fade-in">
      <span class="text-lg flex-shrink-0">${tip.icon}</span>
      <p>${tip.text}</p>
    </div>
  `).join('');
}

/** Renderiza a lista de despesas com filtro e busca */
function renderExpenseList() {
  const search  = (document.getElementById('input-search')?.value || '').toLowerCase().trim();
  let expenses  = filterExpensesByPeriod(state.expenses, state.filter);

  // Filtra pela busca
  if (search) {
    expenses = expenses.filter(e => e.name.toLowerCase().includes(search));
  }

  // Ordena: mais recente primeiro; sem data vai pro final
  expenses.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const container = document.getElementById('expense-list');

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-gray-400">
        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
          <i data-lucide="receipt" class="w-7 h-7 opacity-40"></i>
        </div>
        <p class="font-medium">Nenhuma despesa encontrada</p>
        <p class="text-sm mt-1">Toque em "+ Adicionar Despesa" para começar</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Agrupa por data para exibição
  const grouped = {};
  expenses.forEach(e => {
    const key = e.date || 'sem-data';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  let html = '';
  Object.entries(grouped).forEach(([dateKey, group]) => {
    const dateLabel = dateKey === 'sem-data' ? 'Sem data' : formatDateDisplay(dateKey);
    const dayTotal  = sumExpenses(group);

    html += `
      <div class="flex justify-between items-center px-1 mb-1 mt-2 first:mt-0">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-wide">${dateLabel}</span>
        <span class="text-xs font-bold text-gray-500 dark:text-gray-400">${formatCurrency(dayTotal)}</span>
      </div>
    `;

    group.forEach(e => {
      html += `
        <div class="expense-card p-4 fade-in flex items-center gap-3">
          <!-- Ícone de categoria -->
          <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getCategoryBg(e.category)}">
            <span class="text-lg">${getCategoryEmoji(e.category)}</span>
          </div>

          <!-- Informações da despesa -->
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm text-gray-800 dark:text-white truncate">${escapeHtml(e.name)}</p>
            <div class="flex gap-1.5 mt-0.5 flex-wrap">
              <span class="badge-${e.type} text-xs px-2 py-0.5 rounded-full font-medium">${e.type === 'fixa' ? 'Fixa' : 'Variável'}</span>
              <span class="badge-${e.category} text-xs px-2 py-0.5 rounded-full font-medium">${categoryLabel(e.category)}</span>
            </div>
          </div>

          <!-- Valor + ações -->
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <p class="font-bold text-base text-gray-800 dark:text-white">${formatCurrency(e.value)}</p>
            <div class="flex gap-1">
              <button
                onclick="openExpenseModal('${e.id}')"
                class="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                title="Editar"
              >
                <i data-lucide="pencil" class="w-3 h-3 text-gray-500 dark:text-gray-400"></i>
              </button>
              <button
                onclick="deleteExpense('${e.id}')"
                class="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                title="Excluir"
              >
                <i data-lucide="trash-2" class="w-3 h-3 text-gray-500 dark:text-gray-400"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
  lucide.createIcons();
}

/** Renderiza os gráficos da aba Charts */
function renderCharts() {
  const monthExpenses = filterExpensesByPeriod(state.expenses, 'mes');
  const dist = calcDistribution(monthExpenses);

  // ---- Gráfico de Pizza: categorias ----
  const pieCtx = document.getElementById('chart-pie').getContext('2d');
  if (chartPie) chartPie.destroy();

  const isDark = state.darkMode;
  const textColor = isDark ? '#e5e7eb' : '#374151';

  chartPie = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: ['Necessidades', 'Desejos', 'Economias'],
      datasets: [{
        data: [dist.necessidade, dist.desejo, dist.economia],
        backgroundColor: ['#3b82f6', '#8b5cf6', '#22c55e'],
        borderWidth: 2,
        borderColor: isDark ? '#1f2937' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed)}`
          }
        }
      },
      cutout: '62%'
    }
  });

  // ---- Gráfico de Barras: Real vs Ideal ----
  const barCtx = document.getElementById('chart-bar').getContext('2d');
  if (chartBar) chartBar.destroy();

  const income = totalIncome();
  chartBar = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['Necessidades', 'Desejos', 'Economias'],
      datasets: [
        {
          label: 'Real',
          data: [dist.necessidade, dist.desejo, dist.economia],
          backgroundColor: ['#3b82f6', '#8b5cf6', '#22c55e'],
          borderRadius: 6
        },
        {
          label: 'Ideal',
          data: [income * 0.5, income * 0.3, income * 0.2],
          backgroundColor: ['#bfdbfe', '#ddd6fe', '#bbf7d0'],
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: textColor, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: {
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: v => 'R$ ' + v.toLocaleString('pt-BR')
          },
          grid: { color: isDark ? '#374151' : '#f3f4f6' }
        }
      }
    }
  });

  // ---- Top 5 maiores gastos ----
  const top5 = [...monthExpenses]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topContainer = document.getElementById('top-expenses-list');
  if (top5.length === 0) {
    topContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Nenhuma despesa este mês</p>';
    return;
  }

  const maxVal = top5[0]?.value || 1;
  topContainer.innerHTML = top5.map((e, i) => `
    <div class="flex items-center gap-3 py-1">
      <span class="text-xs font-bold text-gray-400 w-4">${i + 1}</span>
      <div class="flex-1">
        <div class="flex justify-between text-xs mb-0.5">
          <span class="font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[150px]">${escapeHtml(e.name)}</span>
          <span class="font-bold text-gray-700 dark:text-gray-200">${formatCurrency(e.value)}</span>
        </div>
        <div class="rule-bar-track">
          <div class="rule-bar-fill bg-indigo-500" style="width:${(e.value / maxVal) * 100}%"></div>
        </div>
      </div>
    </div>
  `).join('');
}

/** Renderiza a aba de economias */
function renderSavings() {
  renderGoal();
  renderSavingsTips();
  runSimulation();
}

/** Renderiza a meta de economia */
function renderGoal() {
  const goal = state.goal;

  if (goal && goal.target > 0) {
    document.getElementById('goal-display').classList.remove('hidden');
    document.getElementById('goal-empty').classList.add('hidden');
    document.getElementById('btn-goal-label').textContent = 'Editar';

    document.getElementById('goal-name').textContent   = goal.name;
    document.getElementById('goal-saved').textContent  = formatCurrency(goal.saved).replace('R$\u00a0','').replace('R$ ','');
    document.getElementById('goal-target').textContent = formatCurrency(goal.target).replace('R$\u00a0','').replace('R$ ','');

    const pct = Math.min((goal.saved / goal.target) * 100, 100);
    document.getElementById('goal-progress-bar').style.width = pct + '%';

    // ETA baseado em quanto o usuário pode guardar por mês (saldo restante)
    const monthSpent   = sumExpenses(filterExpensesByPeriod(state.expenses, 'mes'));
    const monthBalance = totalIncome() - monthSpent;
    const remaining  = goal.target - goal.saved;
    const etaEl = document.getElementById('goal-eta');

    if (remaining <= 0) {
      etaEl.textContent = '🎉 Meta atingida! Parabéns!';
    } else if (monthBalance > 0) {
      const months = Math.ceil(remaining / monthBalance);
      etaEl.textContent = `Com o saldo atual, você atingirá a meta em ~${months} mês${months > 1 ? 'es' : ''}.`;
    } else {
      etaEl.textContent = `Faltam ${formatCurrency(remaining)} para atingir a meta.`;
    }
  } else {
    document.getElementById('goal-display').classList.add('hidden');
    document.getElementById('goal-empty').classList.remove('hidden');
    document.getElementById('btn-goal-label').textContent = 'Definir meta';
  }
}

/** Renderiza dicas fixas de economia */
function renderSavingsTips() {
  const tips = [
    '💡 Anote tudo que gasta, mesmo pequenas compras. O café diário pode ser R$ 150/mês!',
    '🛒 Faça lista antes de ir ao mercado e evite compras por impulso.',
    '📱 Revise seus assinaturas mensais. Você usa todos os serviços que paga?',
    '🎯 Use a regra "48 horas": antes de uma compra não essencial, espere 2 dias.',
    '🔌 Desligue aparelhos da tomada quando não estiver usando. Economize na conta de luz.',
    '🍱 Levar marmita para o trabalho pode economizar mais de R$ 300/mês.',
    '🏦 Configure débito automático para poupança no dia do salário ("pague-se primeiro").',
    '🚗 Considere alternativas de transporte: carona, bike ou transporte público reduzem custos.'
  ];

  document.getElementById('savings-tips').innerHTML = tips.map(tip => `
    <p class="flex gap-2 items-start py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">${tip}</p>
  `).join('');
}

// =============================================================
// 6. SIMULADOR DE ECONOMIA
// =============================================================

function runSimulation() {
  const monthly = parseFloat(document.getElementById('sim-monthly')?.value) || 0;
  const months  = parseInt(document.getElementById('sim-months')?.value) || 12;

  const resultEl = document.getElementById('sim-result');
  if (monthly <= 0) {
    resultEl.classList.add('hidden');
    return;
  }

  // Simulação com juros simples de poupança (0.5% ao mês)
  const rate  = 0.005;
  let total   = 0;
  for (let i = 0; i < months; i++) {
    total = (total + monthly) * (1 + rate);
  }

  resultEl.classList.remove('hidden');
  document.getElementById('sim-r-months').textContent = `${months} mês${months > 1 ? 'es' : ''}`;
  document.getElementById('sim-r-total').textContent  = formatCurrency(total);

  const pctSalary = totalIncome() > 0 ? ((monthly / totalIncome()) * 100).toFixed(0) : 0;
  document.getElementById('sim-r-note').textContent =
    `Guardando ${pctSalary}% do salário por mês com rendimento de 0,5% a.m. (poupança).`;
}

// =============================================================
// 7. GERENCIAMENTO DE DESPESAS (CRUD)
// =============================================================

/** Abre o modal de despesa. Se id não nulo, edita. Se null, cria. */
function openExpenseModal(id) {
  const modal = document.getElementById('modal-expense');
  const form  = document.getElementById('expense-form');
  form.reset();

  if (id) {
    // Modo edição: preenche o formulário com os dados existentes
    const expense = state.expenses.find(e => e.id === id);
    if (!expense) return;

    document.getElementById('modal-expense-title').textContent = 'Editar Despesa';
    document.getElementById('expense-id').value       = expense.id;
    document.getElementById('expense-name').value     = expense.name;
    document.getElementById('expense-value').value    = expense.value;
    document.getElementById('expense-type').value     = expense.type;
    document.getElementById('expense-category').value = expense.category;
    document.getElementById('expense-date').value     = expense.date || '';
  } else {
    // Modo criação: data padrão = hoje
    document.getElementById('modal-expense-title').textContent = 'Nova Despesa';
    document.getElementById('expense-id').value = '';
    document.getElementById('expense-date').value = toDateStr(new Date());
  }

  modal.classList.remove('hidden');
  document.getElementById('expense-name').focus();
}

function closeExpenseModal() {
  document.getElementById('modal-expense').classList.add('hidden');
}

/** Salva a despesa (criação ou edição) */
function saveExpense(event) {
  event.preventDefault();

  const id       = document.getElementById('expense-id').value;
  const name     = document.getElementById('expense-name').value.trim();
  const value    = parseFloat(document.getElementById('expense-value').value);
  const type     = document.getElementById('expense-type').value;
  const category = document.getElementById('expense-category').value;
  const date     = document.getElementById('expense-date').value;

  if (!name || isNaN(value) || value <= 0) {
    showToast('Preencha nome e valor corretamente!');
    return;
  }

  if (id) {
    // Edita despesa existente
    const idx = state.expenses.findIndex(e => e.id === id);
    if (idx !== -1) {
      state.expenses[idx] = { id, name, value, type, category, date };
      showToast('Despesa atualizada!');
    }
  } else {
    // Cria nova despesa
    state.expenses.push({ id: genId(), name, value, type, category, date });
    showToast('Despesa adicionada!');
  }

  saveState();
  closeExpenseModal();
  refreshAll();
}

/** Exclui uma despesa com confirmação */
function deleteExpense(id) {
  const expense = state.expenses.find(e => e.id === id);
  if (!expense) return;

  if (!confirm(`Excluir "${expense.name}" (${formatCurrency(expense.value)})?`)) return;

  state.expenses = state.expenses.filter(e => e.id !== id);
  saveState();
  showToast('Despesa excluída!');
  refreshAll();
}

// =============================================================
// 8. META DE ECONOMIA
// =============================================================

function openGoalModal() {
  const modal = document.getElementById('modal-goal');
  if (state.goal) {
    document.getElementById('goal-name-input').value   = state.goal.name;
    document.getElementById('goal-target-input').value = state.goal.target;
  } else {
    document.getElementById('goal-name-input').value   = '';
    document.getElementById('goal-target-input').value = '';
  }
  modal.classList.remove('hidden');
}

function closeGoalModal() {
  document.getElementById('modal-goal').classList.add('hidden');
}

function saveGoal() {
  const name   = document.getElementById('goal-name-input').value.trim();
  const target = parseFloat(document.getElementById('goal-target-input').value);

  if (!name || isNaN(target) || target <= 0) {
    showToast('Preencha nome e valor da meta!');
    return;
  }

  state.goal = {
    name,
    target,
    saved: state.goal?.saved || 0
  };

  saveState();
  closeGoalModal();
  renderGoal();
  showToast('Meta salva!');
}

/** Adiciona valor à meta (registrado como progresso) */
function addToGoal() {
  const input = document.getElementById('goal-add-value');
  const value = parseFloat(input.value);

  if (!state.goal || isNaN(value) || value <= 0) {
    showToast('Informe um valor válido!');
    return;
  }

  state.goal.saved += value;
  saveState();
  input.value = '';
  renderGoal();
  showToast(`+ ${formatCurrency(value)} adicionado à meta!`);
}

// =============================================================
// 9. BENEFÍCIOS (cartão alimentação, vale refeição, etc.)
// =============================================================

/** Emoji automático baseado no nome do benefício */
function getBenefitEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes('aliment'))  return '🍽️';
  if (n.includes('refei'))    return '🍱';
  if (n.includes('transport')) return '🚌';
  if (n.includes('saúde') || n.includes('saude') || n.includes('plano')) return '🏥';
  if (n.includes('educa') || n.includes('escola')) return '📚';
  if (n.includes('combustí') || n.includes('combust')) return '⛽';
  return '🎁';
}

function openBenefitModal() {
  document.getElementById('benefit-name-input').value  = '';
  document.getElementById('benefit-value-input').value = '';
  document.getElementById('modal-benefit').classList.remove('hidden');
  document.getElementById('benefit-name-input').focus();
}

function closeBenefitModal() {
  document.getElementById('modal-benefit').classList.add('hidden');
}

function saveBenefit() {
  const nameEl  = document.getElementById('benefit-name-input');
  const valueEl = document.getElementById('benefit-value-input');
  const name    = nameEl.value.trim();
  const value   = parseFloat(valueEl.value);

  if (!name || isNaN(value) || value <= 0) {
    showToast('Preencha nome e valor do benefício!');
    return;
  }

  if (!state.benefits) state.benefits = [];
  state.benefits.push({ id: genId(), name, value });
  saveState();
  closeBenefitModal();
  refreshAll();
  showToast('Benefício adicionado!');
}

function deleteBenefit(id) {
  if (!confirm('Remover este benefício?')) return;
  state.benefits = (state.benefits || []).filter(b => b.id !== id);
  saveState();
  refreshAll();
  showToast('Benefício removido!');
}

// =============================================================
// 10. CONFIGURAÇÕES (salário)
// =============================================================

function openSettings() {
  document.getElementById('settings-salary').value = state.salary;
  document.getElementById('modal-settings').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('modal-settings').classList.add('hidden');
}

function saveSalary() {
  const val = parseFloat(document.getElementById('settings-salary').value);
  if (isNaN(val) || val < 0) {
    showToast('Informe um salário válido!');
    return;
  }
  state.salary = val;
  saveState();
  closeSettings();
  refreshAll();
  showToast('Salário atualizado!');
}

function clearAllData() {
  if (!confirm('Tem certeza? Todos os dados serão apagados permanentemente.')) return;
  localStorage.removeItem('financasfacil_state');
  location.reload();
}

// =============================================================
// 10. MODO ESCURO
// =============================================================

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  applyDarkMode();
  saveState();
  // Recria os gráficos com as novas cores
  if (activeTab === 'charts') renderCharts();
}

function applyDarkMode() {
  const html = document.documentElement;
  if (state.darkMode) {
    html.classList.add('dark');
    html.classList.remove('light');
  } else {
    html.classList.remove('dark');
    html.classList.add('light');
  }

  // Atualiza ícone do botão
  const icon = document.getElementById('icon-theme');
  if (icon) {
    icon.setAttribute('data-lucide', state.darkMode ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

// =============================================================
// 11. NAVEGAÇÃO ENTRE ABAS
// =============================================================

function switchTab(tabName, btnEl) {
  activeTab = tabName;

  // Oculta todas as abas
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

  // Mostra a aba selecionada
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');

  // Atualiza estado dos botões de navegação
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-nav'));
  if (btnEl) btnEl.classList.add('active-nav');

  // Renderiza o conteúdo específico da aba
  if (tabName === 'dashboard') renderDashboard();
  if (tabName === 'expenses')  renderExpenseList();
  if (tabName === 'charts')    renderCharts();
  if (tabName === 'savings')   renderSavings();

  lucide.createIcons();
}

/** Define o filtro de período na aba de despesas */
function setFilter(filter, btnEl) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter'));
  if (btnEl) btnEl.classList.add('active-filter');
  renderExpenseList();
}

// =============================================================
// 12. MODAIS DE INFORMAÇÃO
// =============================================================

function showRuleInfo() {
  document.getElementById('modal-rule-info').classList.remove('hidden');
}
function closeRuleInfo() {
  document.getElementById('modal-rule-info').classList.add('hidden');
}

// =============================================================
// 13. TOAST DE NOTIFICAÇÃO
// =============================================================

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  toast.classList.remove('hidden');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 2500);
}

// =============================================================
// 14. UTILITÁRIOS
// =============================================================

/** Previne XSS escapando HTML */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function getCategoryEmoji(cat) {
  const map = { necessidade: '🏠', desejo: '🎉', economia: '💰' };
  return map[cat] || '📌';
}

function getCategoryBg(cat) {
  const map = {
    necessidade: 'bg-blue-100 dark:bg-blue-900/30',
    desejo:      'bg-purple-100 dark:bg-purple-900/30',
    economia:    'bg-green-100 dark:bg-green-900/30'
  };
  return map[cat] || 'bg-gray-100 dark:bg-gray-700';
}

function categoryLabel(cat) {
  const map = { necessidade: 'Necessidade', desejo: 'Desejo', economia: 'Economia' };
  return map[cat] || cat;
}

// =============================================================
// 15. ATUALIZAÇÃO GERAL DA UI
// =============================================================

/** Re-renderiza a aba atualmente ativa */
function refreshAll() {
  if (activeTab === 'dashboard') renderDashboard();
  if (activeTab === 'expenses')  renderExpenseList();
  if (activeTab === 'charts')    renderCharts();
  if (activeTab === 'savings')   renderSavings();
  lucide.createIcons();
}

// =============================================================
// 16. ONBOARDING (primeira visita)
// =============================================================

/** Chamada pelo botão "Começar agora" na tela de onboarding */
function startApp() {
  const input = document.getElementById('input-salary-onboarding');
  const val   = parseFloat(input.value);

  if (isNaN(val) || val <= 0) {
    input.classList.add('border-red-400');
    input.placeholder = 'Informe seu salário!';
    input.focus();
    return;
  }

  state.salary    = val;
  state.onboarded = true;
  saveState();
  initMainApp();
}

// =============================================================
// 17. INICIALIZAÇÃO DO APLICATIVO
// =============================================================

/** Inicializa o app principal após o onboarding */
function initMainApp() {
  // Oculta onboarding, mostra app
  document.getElementById('screen-onboarding').classList.add('hidden');
  document.getElementById('app-main').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');

  // Atualiza cabeçalho
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const now    = new Date();
  document.getElementById('header-month').textContent =
    `${months[now.getMonth()]} de ${now.getFullYear()}`;

  // Ativa a aba inicial
  const firstNavBtn = document.querySelector('.nav-btn[data-tab="dashboard"]');
  switchTab('dashboard', firstNavBtn);
}

/** Ponto de entrada: executado quando a página carrega */
function init() {
  loadState();
  applyDarkMode();

  // Fecha modais ao clicar no backdrop
  ['modal-expense','modal-goal','modal-settings','modal-rule-info','modal-benefit'].forEach(id => {
    document.getElementById(id).addEventListener('click', function(e) {
      if (e.target === this) this.classList.add('hidden');
    });
  });

  if (state.onboarded && state.salary > 0) {
    // Usuário já configurou: vai direto para o app
    initMainApp();
  } else {
    // Primeira visita: mostra tela de onboarding
    document.getElementById('screen-onboarding').classList.remove('hidden');
    // Inicializa ícones Lucide no onboarding
    lucide.createIcons();
  }
}

// Aguarda o DOM carregar completamente antes de iniciar
document.addEventListener('DOMContentLoaded', init);
