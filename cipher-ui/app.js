/** Cipher - NAMI-style agent workspace controller. */
document.addEventListener('DOMContentLoaded', () => {
    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];
    const state = { status: null, sessions: [], selectedSession: null, answer: null, workspace: null, openFolders: new Set(['.']), openFiles: [], loadingFiles: new Set(), activeFile: null, activeTab: 'sessions', activeSidebarTab: 'sessions' };

    const tabButtons = $$('.section-tab');
    const sidebarTabButtons = $$('.sidebar-tab');
    const views = $$('.app-view');
    const sidebarViews = $$('.sidebar-view');
    const loadingLine = $('#loading-line');
    const sessionList = $('#session-list');
    const sessionCount = $('#session-count');
    const sessionHeading = $('#sessions-heading');
    const sessionContext = $('#session-context');
    const analysisGrid = $('#analysis-grid');
    const metricStrip = $('#metric-strip');
    const mainPlot = $('#main-plot');
    const plotCaption = $('#plot-caption');
    const answerSummary = $('#answer-summary');
    const answerModel = $('#answer-model');
    const planOutput = $('#plan-output');
    const togglePlan = $('#toggle-plan');
    const takeawaysCard = $('#takeaways-card');
    const promptForm = $('#prompt-form');
    const promptInput = $('#prompt-input');
    const settingsButton = $('#settings-button');
    const profileButton = $('#profile-button');
    const settingsMenu = $('#settings-menu');
    const profileMenu = $('#profile-menu');
    const fileUploadInput = $('#file-upload-input');
    const sessionsView = $('#sessions-view');
    const workspaceEditor = $('#workspace-editor');
    const editorTabstrip = $('#editor-tabstrip');
    const editorPanel = $('#editor-panel');
    const sidebarResizer = $('.sidebar-resizer');
    const sidebarToggle = $('#sidebar-toggle');
    const namiShell = $('.nami-shell');
    const sidecar = $('.sidecar');
    const themeOptions = $$('.theme-option');
    const themeStorageKey = 'cipher-theme';
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    let preferredTheme = 'system';

    // Sidebar resize functionality
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    function initSidebarResize() {
        const storedWidth = localStorage.getItem('cipher-sidebar-width');
        if (storedWidth) {
            document.documentElement.style.setProperty('--sidebar-width', storedWidth + 'px');
        }

        sidebarResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidecar.offsetWidth;
            sidebarResizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(600, startWidth + delta));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                sidebarResizer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                const currentWidth = sidecar.offsetWidth;
                localStorage.setItem('cipher-sidebar-width', currentWidth);
            }
        });
    }

    function toggleSidebar() {
        const isMinimized = namiShell.classList.toggle('sidebar-minimized');
        localStorage.setItem('cipher-sidebar-minimized', isMinimized ? 'true' : 'false');
        sidebarToggle.setAttribute('aria-label', isMinimized ? 'Show sidebar' : 'Hide sidebar');
    }

    function initSidebarState() {
        const isMinimized = localStorage.getItem('cipher-sidebar-minimized') === 'true';
        if (isMinimized) {
            namiShell.classList.add('sidebar-minimized');
            sidebarToggle.setAttribute('aria-label', 'Show sidebar');
        }
    }

    function storedTheme() {
        try { return localStorage.getItem(themeStorageKey) || 'system'; }
        catch (_) { return 'system'; }
    }
    function applyTheme(theme) {
        preferredTheme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
        const resolved = preferredTheme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preferredTheme;
        document.documentElement.dataset.theme = resolved;
        themeOptions.forEach(option => option.setAttribute('aria-pressed', String(option.dataset.themeOption === preferredTheme)));
        if (state.answer) plot(state.answer.primary_chart || state.answer.figure);
    }
    function saveTheme(theme) {
        try { localStorage.setItem(themeStorageKey, theme); } catch (_) { /* Storage may be disabled. */ }
        applyTheme(theme);
    }

    function showLoading() { loadingLine.classList.remove('hidden'); }
    function hideLoading() { loadingLine.classList.add('hidden'); }
    function esc(value) { const element = document.createElement('div'); element.textContent = value == null ? '' : String(value); return element.innerHTML; }
    function fmt(value) { return value == null ? '-' : typeof value === 'number' ? value.toLocaleString() : String(value); }
    function short(value, length = 60) { const text = String(value || '').trim(); return text.length > length ? `${text.slice(0, length - 1).trimEnd()}...` : text; }
    function timeAgo(iso) {
        const timestamp = Date.parse(iso);
        if (Number.isNaN(timestamp)) return 'now';
        const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m ago`;
        if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
        return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    async function api(method, path, body) {
        const options = { method, headers: {} };
        if (body instanceof FormData) options.body = body;
        else if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
        const response = await fetch(path, options);
        if (!response.ok) { const error = await response.json().catch(() => ({ detail: response.statusText })); throw new Error(error.detail || response.statusText); }
        return response.json();
    }
    function setStatus(text, ready = false) {
        const statusText = $('#status-text');
        if (statusText) statusText.textContent = text.toUpperCase();
        const railStatus = $('#rail-status');
        if (railStatus) railStatus.textContent = text.toUpperCase();
        const stateBtn = $('#state-button');
        if (stateBtn) stateBtn.classList.toggle('is-ready', ready);
    }

    function plotTheme() {
        const dark = document.documentElement.dataset.theme === 'dark';
        return {
            paper_bgcolor: dark ? '#262626' : '#f5f5f5',
            plot_bgcolor: dark ? '#262626' : '#f5f5f5',
            font: { family: 'DM Sans, sans-serif', color: dark ? '#fafafa' : '#171717', size: 12 },
            margin: { l: 42, r: 18, t: 22, b: 38 },
            xaxis: { gridcolor: dark ? 'rgba(250,250,250,.15)' : 'rgba(23,23,23,.15)', linecolor: dark ? 'rgba(250,250,250,.28)' : 'rgba(23,23,23,.28)', tickfont: { family: 'DM Mono, monospace', color: dark ? '#a3a3a3' : '#737373', size: 9 } },
            yaxis: { gridcolor: dark ? 'rgba(250,250,250,.15)' : 'rgba(23,23,23,.15)', linecolor: dark ? 'rgba(250,250,250,.28)' : 'rgba(23,23,23,.28)', tickfont: { family: 'DM Mono, monospace', color: dark ? '#a3a3a3' : '#737373', size: 9 } },
            hoverlabel: { bgcolor: dark ? '#171717' : '#171717', bordercolor: dark ? '#171717' : '#171717', font: { family: 'DM Sans, sans-serif', color: '#fafafa', size: 12 } },
            trace: dark ? '#a3a3a3' : '#525252',
        };
    }
    function plot(spec) {
        if (!spec || !spec.data || !window.Plotly) { mainPlot.innerHTML = '<p class="plot-empty">No chart was returned for this question.</p>'; return; }
        const theme = plotTheme();
        const layout = Object.assign({}, theme, spec.layout || {});
        layout.paper_bgcolor = theme.paper_bgcolor;
        layout.plot_bgcolor = theme.plot_bgcolor;
        layout.font = theme.font;
        layout.hoverlabel = theme.hoverlabel;
        ['xaxis', 'yaxis'].forEach(axis => { if (layout[axis]) Object.assign(layout[axis], theme[axis]); });
        (spec.data || []).forEach(trace => {
            if (trace.marker) { trace.marker.color = trace.marker.color || theme.trace; if (trace.marker.line) trace.marker.line.color = theme.paper_bgcolor; }
            if (trace.line) trace.line.color = theme.trace;
        });
        Plotly.newPlot(mainPlot, spec.data, layout, { responsive: true, displayModeBar: false });
    }

    function switchTab(tab) {
        state.activeTab = tab;
        tabButtons.forEach(button => { const selected = button.dataset.tab === tab; button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected)); });
        views.forEach(view => { const active = view.id === `${tab}-view`; view.classList.toggle('active', active); view.hidden = !active; });
        if (!state.workspace) loadWorkspace();
        renderLibrarySidebar();
    }

    function switchSidebarTab(tab) {
        state.activeSidebarTab = tab;
        sidebarTabButtons.forEach(button => {
            const selected = button.dataset.sidebarTab === tab;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-selected', String(selected));
        });
        sidebarViews.forEach(view => {
            const active = view.id === `sidebar-${tab}-view`;
            view.classList.toggle('active', active);
            view.hidden = !active;
        });
        if (tab === 'sessions') hideWorkspaceEditor();
        if (tab === 'workspace' && !state.workspace) loadWorkspace();
        if (tab === 'agents') renderLibrarySidebar();
    }

    function renderSessions() {
        const sessions = [...state.sessions].reverse();
        sessionCount.textContent = sessions.length;
        $('#header-note').textContent = 'CIPHER';
        if (!sessions.length) { sessionList.innerHTML = '<p class="session-list-empty">Questions you ask in this workspace appear here.</p>'; return; }
        sessionList.innerHTML = sessions.map(item => `
            <div class="session-item-row ${item.id === state.selectedSession ? 'active' : ''}">
                <button type="button" class="session-item" data-session-id="${esc(item.id)}">
                    <span class="session-item-subject">${esc(short(item.subject, 44))}</span>
                    <span class="session-item-time">${esc(timeAgo(item.time))}</span>
                </button>
                <button type="button" class="session-delete-btn" data-delete-session-id="${esc(item.id)}" aria-label="Delete chat" title="Delete chat">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>`).join('');
        $$('.session-item').forEach(item => item.addEventListener('click', () => selectSession(item.dataset.sessionId)));
        $$('.session-delete-btn').forEach(btn => btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(btn.dataset.deleteSessionId);
        }));
    }

    async function deleteSession(id) {
        showLoading();
        try {
            await api('DELETE', `/api/sessions/${encodeURIComponent(id)}`);
            state.sessions = state.sessions.filter(s => String(s.id) !== String(id));
            if (state.selectedSession === id) {
                if (state.sessions.length > 0) {
                    selectSession(state.sessions[state.sessions.length - 1].id);
                } else {
                    resetStage();
                }
            } else {
                renderSessions();
            }
        } catch (error) {
            window.alert(`Could not delete session: ${error.message}`);
        } finally {
            hideLoading();
        }
    }

    function clearResultDetails() {
        analysisGrid.classList.add('hidden');
        mainPlot.replaceChildren();
        state.answer = null;
    }
    function resetStage() {
        state.selectedSession = null;
        sessionHeading.textContent = 'What would you like to know?';
        sessionContext.textContent = '';
        sessionContext.hidden = true;
        clearResultDetails();
        renderSessions();
    }
    function selectSession(id) {
        hideWorkspaceEditor();
        state.selectedSession = id;
        const selected = state.sessions.find(item => item.id === id);
        renderSessions();
        if (!selected) return;
        sessionHeading.textContent = selected.subject || selected.question || 'Analysis Session';
        if (selected.question) {
            sessionContext.textContent = `“${selected.question}”`;
            sessionContext.hidden = false;
        } else {
            sessionContext.textContent = '';
            sessionContext.hidden = true;
        }
        if (selected.result) {
            renderAnswer(selected.result);
        } else if (!state.answer || state.answer.question !== (selected.question || selected.subject)) {
            clearResultDetails();
        }
    }

    function renderAnswer(result) {
        state.answer = result;
        analysisGrid.classList.remove('hidden');
        metricStrip.innerHTML = (result.tiles || []).slice(0, 5).map(tile => `<article class="metric"><span class="metric-label">${esc(tile.label)}</span><strong class="metric-value">${esc(tile.value)}</strong><span class="metric-note">${esc(tile.note || tile.about || '')}</span></article>`).join('');
        if (!metricStrip.children.length) metricStrip.innerHTML = '<article class="metric"><span class="metric-label">RESULT</span><strong class="metric-value">READY</strong></article>';
        answerSummary.textContent = result.summary || 'Cipher completed this analysis.';
        answerModel.textContent = `${result.model || 'Cipher engine'} / ${result.snapshot_id || 'current workspace'}`;
        plotCaption.textContent = result.caption || 'Computed from the active dataset';
        planOutput.textContent = JSON.stringify(result.plan || {}, null, 2);
        planOutput.hidden = true; togglePlan.textContent = 'QUERY PLAN'; togglePlan.setAttribute('aria-expanded', 'false');
        const takeaways = result.takeaways || [];
        takeawaysCard.innerHTML = takeaways.length ? `<h2>What to notice</h2><ul>${takeaways.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
        plot(result.primary_chart || result.figure);
    }
    async function loadSessions() {
        const response = await api('GET', '/api/sessions');
        state.sessions = response.sessions || [];
        if (state.selectedSession && !state.sessions.some(item => item.id === state.selectedSession)) state.selectedSession = null;
        renderSessions();
    }

    function directoryIsOpen(path) {
        return state.openFolders.has(path);
    }

    function renderWorkspaceTree(nodes, depth = 0) {
        return (nodes || []).map(node => {
            const isDirectory = node.type === 'directory';
            const isOpen = isDirectory && directoryIsOpen(node.path);
            const depthStyle = `--tree-depth:${depth}`;
            const disclosure = isDirectory ? `<span class="tree-disclosure" aria-hidden="true">${isOpen ? '⌄' : '›'}</span>` : '<span class="tree-disclosure tree-disclosure-empty" aria-hidden="true"></span>';
            return `<div class="workspace-tree-node" style="${depthStyle}">
                <button type="button" class="workspace-tree-item ${isDirectory ? 'workspace-tree-folder' : 'workspace-tree-file'} ${node.path === state.activeFile ? 'active' : ''}" role="treeitem" ${isDirectory ? `aria-expanded="${isOpen}"` : ''} data-path="${esc(node.path)}" data-kind="${esc(node.type)}" title="${esc(node.path)}">
                    ${disclosure}<span class="workspace-tree-label">${esc(node.name)}</span>
                </button>${isDirectory && isOpen ? `<div class="workspace-tree-children" role="group">${renderWorkspaceTree(node.children, depth + 1)}</div>` : ''}
            </div>`;
        }).join('');
    }

    function bindWorkspaceTree(container) {
        container.querySelectorAll('.workspace-tree-item').forEach(button => button.addEventListener('click', async () => {
            const { path, kind } = button.dataset;
            if (kind === 'directory') {
                state.openFolders.has(path) ? state.openFolders.delete(path) : state.openFolders.add(path);
                renderWorkspaceSidebar();
                return;
            }
            await openWorkspaceFile(path);
        }));
    }

    function renderWorkspaceSidebar() {
        if (!state.workspace) return;
        $('#tree-status-sidebar').textContent = state.workspace.validation_status || 'ready';
        const sidebarTree = $('#workspace-tree-sidebar');
        sidebarTree.innerHTML = renderWorkspaceTree(state.workspace.tree);
        bindWorkspaceTree(sidebarTree);
    }

    function showWorkspaceEditor() {
        sessionsView.hidden = true;
        sessionsView.classList.remove('active');
        workspaceEditor.hidden = false;
        document.body.classList.add('workspace-editor-open');
    }

    function hideWorkspaceEditor() {
        workspaceEditor.hidden = true;
        sessionsView.hidden = false;
        sessionsView.classList.add('active');
        document.body.classList.remove('workspace-editor-open');
    }

    function renderEditor() {
        const activeFile = state.openFiles.find(file => file.path === state.activeFile);
        editorTabstrip.innerHTML = state.openFiles.map((file, index) => {
            const active = file.path === state.activeFile;
            const tabId = `editor-tab-${index}`;
            return `<div class="editor-tab ${active ? 'active' : ''}">
                <button type="button" class="editor-tab-button" id="${tabId}" role="tab" aria-selected="${active}" aria-controls="editor-panel" tabindex="${active ? '0' : '-1'}" data-path="${esc(file.path)}" title="${esc(file.path)}">${esc(file.name || file.path)}</button>
                <button type="button" class="editor-tab-close" aria-label="Close ${esc(file.name || file.path)}" data-path="${esc(file.path)}">×</button>
            </div>`;
        }).join('');
        editorTabstrip.hidden = !state.openFiles.length;

        if (!activeFile) {
            editorPanel.setAttribute('aria-labelledby', '');
            editorPanel.innerHTML = `<div class="editor-empty-state"><h2>No file open</h2><p>Select a file from the Workspace sidebar to open it here.</p></div>`;
            return;
        }

        const tabIndex = state.openFiles.indexOf(activeFile);
        const loadable = ['.csv', '.tsv', '.xlsx', '.xls', '.json'].includes(activeFile.extension);
        editorPanel.setAttribute('aria-labelledby', `editor-tab-${tabIndex}`);
        editorPanel.innerHTML = `
            <div class="editor-file-view">
                <div class="editor-file-header">
                    <div><h2>${esc(activeFile.name || activeFile.path)}</h2><p>${esc(activeFile.path)}</p></div>
                    <div class="editor-file-meta"><span>${esc(activeFile.extension || 'FILE')}</span><span>${esc(activeFile.size_formatted)}</span>${activeFile.lines_count ? `<span>${esc(activeFile.lines_count)} lines</span>` : ''}</div>
                </div>
                <pre class="editor-file-content">${esc(activeFile.content)}</pre>
                ${loadable ? '<div class="file-actions"><button type="button" class="file-action-button" id="load-workspace-file">USE AS ACTIVE DATASET</button></div>' : ''}
            </div>`;
        const loadButton = $('#load-workspace-file');
        if (loadButton) loadButton.addEventListener('click', () => loadWorkspaceDataset(activeFile.path));

        editorTabstrip.querySelectorAll('.editor-tab-button').forEach(button => button.addEventListener('click', () => activateWorkspaceFile(button.dataset.path)));
        editorTabstrip.querySelectorAll('.editor-tab-close').forEach(button => button.addEventListener('click', () => closeWorkspaceFile(button.dataset.path)));
    }

    function activateWorkspaceFile(path) {
        state.activeFile = path;
        renderWorkspaceSidebar();
        renderEditor();
    }

    function closeWorkspaceFile(path) {
        const closingIndex = state.openFiles.findIndex(file => file.path === path);
        if (closingIndex < 0) return;
        const wasActive = state.activeFile === path;
        state.openFiles.splice(closingIndex, 1);
        if (wasActive) state.activeFile = state.openFiles[Math.min(closingIndex, state.openFiles.length - 1)]?.path || null;
        renderWorkspaceSidebar();
        if (state.openFiles.length) renderEditor();
        else hideWorkspaceEditor();
    }

    async function openWorkspaceFile(path) {
        const existing = state.openFiles.find(file => file.path === path);
        if (existing) {
            showWorkspaceEditor();
            activateWorkspaceFile(path);
            return;
        }
        if (state.loadingFiles.has(path)) return;

        state.loadingFiles.add(path);
        showLoading();
        state.activeFile = path;
        showWorkspaceEditor();
        renderWorkspaceSidebar();
        editorPanel.innerHTML = `<div class="editor-empty-state"><h2>Opening file</h2><p>${esc(path)}</p></div>`;
        try {
            const file = await api('GET', `/api/workspace/file?path=${encodeURIComponent(path)}`);
            if (!state.openFiles.some(openFile => openFile.path === path)) state.openFiles.push(file);
            if (state.activeFile === path) activateWorkspaceFile(path);
        } catch (error) {
            if (state.activeFile === path) {
                state.activeFile = state.openFiles.at(-1)?.path || null;
                renderWorkspaceSidebar();
                if (state.activeFile) renderEditor();
                else editorPanel.innerHTML = `<div class="editor-empty-state"><h2>Could not open file</h2><p>${esc(error.message)}</p></div>`;
            }
        } finally {
            state.loadingFiles.delete(path);
            hideLoading();
        }
    }

    async function loadWorkspaceDataset(path) {
        showLoading();
        try {
            const result = await api('POST', '/api/workspace/load', { path });
            await refreshStatus();
            resetStage();
            setStatus(`loaded ${result.dataset_name}`, true);
            switchSidebarTab('sessions');
        } catch (error) {
            window.alert(`Could not load this dataset: ${error.message}`);
        } finally {
            hideLoading();
        }
    }

    function renderLibrary() {
        const status = state.status || {};
        const profile = status.profile || {};
        const pipeline = status.latest_pipeline || {};
        const fields = [...(profile.measures || []), ...(profile.dimensions || []), ...(profile.temporal || [])];
        const groups = [
            { label: 'AGENT', rows: [{ title: 'Cipher', detail: 'Grounded local analysis for the active dataset.', tag: status.has_active_log ? 'ACTIVE' : 'LOCAL', state: status.has_active_log ? 'ready' : '' }] },
            { label: 'SKILL', rows: [{ title: 'Data analysis', detail: fields.length ? `${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '...' : ''}` : 'Semantic schema is available after a dataset loads.', tag: `${fields.length} FIELDS`, state: '' }, { title: 'Cleaning pipeline', detail: pipeline.verdict || 'Run the pipeline from settings to create a fresh report.', tag: pipeline.ok ? 'PASSED' : 'AVAILABLE', state: pipeline.ok ? 'ready' : '' }] },
            { label: 'SERVICE', rows: [{ title: status.dataset_name || 'Active dataset', detail: `${fmt(status.row_count)} rows / ${fmt(status.col_count)} columns`, tag: (status.validation_status || 'UNVALIDATED').toUpperCase(), state: status.validation_status === 'passed' ? 'ready' : 'warning' }] },
        ];
        $('#library-list').innerHTML = groups.map(group => `<section class="library-group"><p class="library-group-label">${group.label}</p>${group.rows.map(row => `<article class="library-row"><span class="library-icon" aria-hidden="true">+</span><div class="library-content"><h2>${esc(row.title)}</h2><p>${esc(row.detail)}</p></div><span class="library-tag ${row.state}">${esc(row.tag)}</span></article>`).join('')}</section>`).join('');
    }

    function renderLibrarySidebar() {
        const status = state.status || {};
        const agents = [
            { title: 'Cipher', tag: status.has_active_log ? 'ACTIVE' : 'LOCAL' },
        ];
        $('#library-list-sidebar').innerHTML = agents.map(agent => `<button type="button" class="sidebar-agent-item"><span class="sidebar-agent-icon" aria-hidden="true">+</span><span class="sidebar-agent-label">${esc(agent.title)}</span><span class="sidebar-agent-tag">${esc(agent.tag)}</span></button>`).join('');
    }

    async function refreshStatus() {
        state.status = await api('GET', '/api/status');
        const ready = state.status.validation_status === 'passed';
        setStatus(ready ? 'ready' : (state.status.validation_status || 'working'), ready);
        renderLibrarySidebar();
    }
    function closeMenus() { settingsMenu.hidden = true; profileMenu.hidden = true; settingsButton.setAttribute('aria-expanded', 'false'); profileButton.setAttribute('aria-expanded', 'false'); }
    async function runPipeline() {
        closeMenus(); showLoading();
        try { const result = await api('POST', '/api/pipeline/run', {}); await refreshStatus(); setStatus(result.verdict || 'pipeline complete', Boolean(result.ok)); }
        catch (error) { setStatus('pipeline unavailable'); window.alert(`Pipeline could not run: ${error.message}`); }
        finally { hideLoading(); }
    }
    async function clearSessions() {
        closeMenus(); showLoading();
        try { await api('POST', '/api/reset', {}); state.sessions = []; resetStage(); setStatus('sessions cleared', state.status?.validation_status === 'passed'); }
        catch (error) { window.alert(`Could not clear sessions: ${error.message}`); }
        finally { hideLoading(); }
    }
    async function loadWorkspace() {
        showLoading();
        try {
            state.workspace = await api('GET', '/api/workspace/tree');
            renderWorkspaceSidebar();
        } catch (error) {
            $('#workspace-tree-sidebar').innerHTML = `<p class="session-list-empty">${esc(error.message)}</p>`;
        } finally {
            hideLoading();
        }
    }

    async function submitQuestion(question) {
        const value = question.trim();
        if (!value) return;
        state.selectedSession = null;
        sessionHeading.textContent = value;
        sessionContext.textContent = 'Analyzing dataset...';
        sessionContext.hidden = false;
        clearResultDetails();
        renderSessions();
        showLoading();
        try {
            const result = await api('POST', '/api/ask', { question: value });
            await loadSessions();
            const latest = state.sessions.at(-1);
            if (latest) {
                if (result.ok) latest.result = result;
                selectSession(latest.id);
            }
            if (result.ok) {
                renderAnswer(result);
            } else {
                sessionHeading.textContent = 'Could not answer question';
                sessionContext.textContent = result.refusal || 'Cipher could not answer this question.';
                sessionContext.hidden = false;
            }
        } catch (error) {
            sessionHeading.textContent = 'Connection Error';
            sessionContext.textContent = `Analysis error: ${error.message}`;
            sessionContext.hidden = false;
        } finally {
            hideLoading();
        }
    }

    themeOptions.forEach(option => option.addEventListener('click', () => saveTheme(option.dataset.themeOption)));
    systemTheme.addEventListener('change', () => { if (preferredTheme === 'system') applyTheme('system'); });
    applyTheme(storedTheme());

    tabButtons.forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    sidebarTabButtons.forEach(button => button.addEventListener('click', () => switchSidebarTab(button.dataset.sidebarTab)));
    sidebarToggle.addEventListener('click', toggleSidebar);
    editorTabstrip.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...editorTabstrip.querySelectorAll('.editor-tab-button')];
        const currentIndex = tabs.indexOf(document.activeElement);
        if (currentIndex < 0 || !tabs.length) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex].focus();
        activateWorkspaceFile(tabs[nextIndex].dataset.path);
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !state.activeFile) return;
        const treeItem = $(`.workspace-tree-item[data-path="${CSS.escape(state.activeFile)}"]`);
        if (treeItem) treeItem.focus();
    });
    $('#new-session-button').addEventListener('click', () => { hideWorkspaceEditor(); switchSidebarTab('sessions'); resetStage(); promptInput.focus(); });
    settingsButton.addEventListener('click', event => { event.stopPropagation(); const open = settingsMenu.hidden; closeMenus(); settingsMenu.hidden = !open; settingsButton.setAttribute('aria-expanded', String(open)); });
    profileButton.addEventListener('click', event => { event.stopPropagation(); const open = profileMenu.hidden; closeMenus(); profileMenu.hidden = !open; profileButton.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('click', event => { if (!event.target.closest('.menu-popover') && !event.target.closest('.mini-button') && !event.target.closest('.profile-button')) closeMenus(); });
    $('#run-pipeline-button').addEventListener('click', runPipeline);
    $('#reset-button').addEventListener('click', clearSessions);
    promptForm.addEventListener('submit', event => { event.preventDefault(); const question = promptInput.value; promptInput.value = ''; submitQuestion(question); });
    togglePlan.addEventListener('click', () => { const visible = planOutput.hidden; planOutput.hidden = !visible; togglePlan.textContent = visible ? 'HIDE PLAN' : 'QUERY PLAN'; togglePlan.setAttribute('aria-expanded', String(visible)); });
    fileUploadInput.addEventListener('change', async event => {
        if (!event.target.files?.length) return;
        const body = new FormData(); [...event.target.files].forEach(file => body.append('files', file)); showLoading();
        try {
            const result = await api('POST', '/api/upload', body);
            await refreshStatus();
            resetStage();
            state.workspace = null;
            await loadWorkspace();
            setStatus(`imported ${result.dataset_name}`, true);
        } catch (error) { window.alert(`Import failed: ${error.message}`); }
        finally { hideLoading(); fileUploadInput.value = ''; }
    });

    (async function boot() {
        showLoading();
        initSidebarResize();
        initSidebarState();
        try { await Promise.all([refreshStatus(), loadSessions(), loadWorkspace()]); }
        catch (error) { setStatus('offline'); sessionContext.textContent = `Cipher could not reach the local API: ${error.message}`; }
        finally { hideLoading(); }
    }());
});
