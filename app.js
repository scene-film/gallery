// ╔════════════════════════════════════════════════════════════════╗
        // ║                                                                ║
        // ║   ★★★ 設定エリア - GAS URLはここを変更 ★★★                  ║
        // ║                                                                ║
        // ╚════════════════════════════════════════════════════════════════╝
        
        const CONFIG = {
            // ↓↓↓ Google Apps ScriptのウェブアプリURLをここに貼り付け ↓↓↓
            GAS_URL: 'https://script.google.com/macros/s/AKfycbyp-HvGFS2nMguBAF7sD-NYezcPCM63-ZRDe6ZkEuxrYUhQr23__xUmPulHGDTfyHIJFQ/exec'
            // ↑↑↑ ここまで ↑↑↑
        };
        
        // ╔════════════════════════════════════════════════════════════════╗
        // ║   設定エリア終わり - 以下は編集不要                            ║
        // ╚════════════════════════════════════════════════════════════════╝

        // 状態管理
        let videos = [];
        let categories = [];
        let currentFilter = 'All';
        let currentSort = 'date-desc';
        let currentUploadType = 'url';
        let selectedFile = null;
        let detectedPlatform = null;
        // bookmarkData: { videoId: { category: 'CM', bookmarkCategories: ['お気に入り', '参考資料'] } }
        let bookmarkData = {};
        let bookmarkCategoryList = []; // _BookmarkCategoriesシートから取得
        let searchQuery = '';
        let bookmarkSearchQuery = '';
        let currentBookmarkFilter = 'All';
        let bookmarkPageSort = 'date-desc';
        
        // ページモード（'main' または 'bookmark'）
        let currentPageMode = 'main';
        
        // 確認モーダル用
        let confirmResolve = null;
        
        function showConfirmModal(message, title = '確認', okText = '削除') {
            return new Promise((resolve) => {
                confirmResolve = resolve;
                document.getElementById('confirm-title').textContent = title;
                document.getElementById('confirm-message').textContent = message;
                document.getElementById('confirm-ok-btn').textContent = okText;
                document.getElementById('confirm-modal').classList.add('active');
            });
        }
        
        // ===== ページ切り替え機能 =====
        function switchToMainPage() {
            if (currentPageMode === 'main') return;
            currentPageMode = 'main';
            
            // トップバー切り替え
            document.getElementById('main-topbar').style.display = '';
            document.getElementById('bookmark-topbar').style.display = 'none';
            
            // サイドバーボタンのアクティブ状態
            document.getElementById('home-sidebar-btn').classList.add('active');
            document.getElementById('bookmark-sidebar-btn').classList.remove('active');
            
            // ギャラリー再描画
            renderGallery();
        }
        
        function switchToBookmarkPage() {
            currentPageMode = 'bookmark';
            
            // トップバー切り替え
            document.getElementById('main-topbar').style.display = 'none';
            document.getElementById('bookmark-topbar').style.display = '';
            
            // サイドバーボタンのアクティブ状態
            document.getElementById('home-sidebar-btn').classList.remove('active');
            document.getElementById('bookmark-sidebar-btn').classList.add('active');
            
            // ブックマークカテゴリボタンを生成
            renderBookmarkPageFilters();
            
            // ギャラリー再描画（ブックマークのみ）
            renderGallery();
        }
        
        function renderBookmarkPageFilters() {
            const container = document.getElementById('bookmark-filters');
            
            // ブックマークカテゴリ別のカウントを計算
            const bookmarkedIds = getBookmarkedIds();
            const categoryCounts = { All: bookmarkedIds.length };
            
            bookmarkedIds.forEach(id => {
                const data = bookmarkData[id];
                const cats = data?.bookmarkCategories || ['お気に入り'];
                cats.forEach(cat => {
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                });
            });
            
            const cats = ['All', ...bookmarkCategoryList];
            
            let html = cats.map(cat => {
                const count = categoryCounts[cat] || 0;
                const isAll = cat === 'All';
                return `
                    <div class="filter-btn-wrapper">
                        <button class="filter-btn ${currentBookmarkFilter === cat ? 'active' : ''}" 
                                onclick="filterBookmarkPage('${cat}')">
                            ${cat}
                            <span class="filter-count">(${count})</span>
                        </button>
                        ${!isAll ? `
                            <button class="filter-edit-btn" onclick="openEditBookmarkCategoryModal('${cat}')" title="編集">
                                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');
            
            container.innerHTML = html;
        }
        
        function filterBookmarkPage(category) {
            currentBookmarkFilter = category;
            renderBookmarkPageFilters();
            renderGallery();
        }
        
        function searchBookmarkPage() {
            const input = document.getElementById('bookmark-search-input');
            const clearBtn = document.getElementById('bookmark-search-clear');
            bookmarkSearchQuery = input.value.trim().toLowerCase();
            clearBtn.style.display = bookmarkSearchQuery ? 'block' : 'none';
            renderGallery();
        }
        
        function clearBookmarkSearch() {
            document.getElementById('bookmark-search-input').value = '';
            document.getElementById('bookmark-search-clear').style.display = 'none';
            bookmarkSearchQuery = '';
            renderGallery();
        }
        
        function sortBookmarkPage() {
            bookmarkPageSort = document.getElementById('bookmark-sort-select').value;
            renderGallery();
        }
        
        function closeConfirmModal(result) {
            document.getElementById('confirm-modal').classList.remove('active');
            if (confirmResolve) {
                confirmResolve(result);
                confirmResolve = null;
            }
        }

        // ===== リンクタイプ判定 =====
        // YouTube, Vimeo, Dropbox以外のURLは外部リンクとして扱う
        function isExternalLink(video) {
            const source = video.source || 'unknown';
            const url = video.videoUrl || '';
            
            // source が 'external' の場合は外部リンク
            if (source === 'external') {
                return true;
            }
            
            // YouTube, Vimeo, Dropboxは動画として扱う
            if (source === 'youtube' || source === 'vimeo' || source === 'dropbox') {
                return false;
            }
            
            // URLが存在し、http/httpsで始まる場合は外部リンク
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                return true;
            }
            
            return false;
        }

        // 外部リンクのドメイン名を取得
        function getExternalLinkDomain(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname.replace('www.', '');
            } catch {
                return 'Link';
            }
        }

        // ブックマークデータをスプレッドシートから読み込み（常に_BookmarkCategoriesシートから取得）
        async function loadBookmarkData() {
            try {
                // カテゴリ一覧を取得（_BookmarkCategoriesシートから）
                const categories = await fetchJsonp(CONFIG.GAS_URL + '?action=getBookmarkCategories');
                if (Array.isArray(categories) && categories.length > 0) {
                    // 文字列のみフィルタリング
                    bookmarkCategoryList = categories.filter(cat => typeof cat === 'string' && cat.trim() !== '');
                } else {
                    // カテゴリがない場合は空配列
                    bookmarkCategoryList = [];
                    console.warn('ブックマークカテゴリが見つかりません。_BookmarkCategoriesシートを確認してください。');
                }
                
                // ブックマークデータを取得
                const bookmarks = await fetchJsonp(CONFIG.GAS_URL + '?action=getBookmarks');
                if (bookmarks && !bookmarks.error && typeof bookmarks === 'object') {
                    // スプレッドシートのデータをbookmarkData形式に変換
                    bookmarkData = {};
                    Object.keys(bookmarks).forEach(categoryName => {
                        // カテゴリ名が有効な文字列かチェック
                        if (typeof categoryName !== 'string' || categoryName.trim() === '' || categoryName === '[object Object]') {
                            return;
                        }
                        
                        const videoList = bookmarks[categoryName];
                        if (!Array.isArray(videoList)) return;
                        
                        videoList.forEach(video => {
                            // videoが有効なオブジェクトかチェック
                            if (!video || typeof video !== 'object') return;
                            
                            const videoId = video.id;
                            // videoIdが有効な値かチェック
                            if (videoId === undefined || videoId === null || videoId === '' || 
                                typeof videoId === 'object' || String(videoId) === '[object Object]') {
                                return;
                            }
                            
                            if (!bookmarkData[videoId]) {
                                bookmarkData[videoId] = {
                                    category: video.originalCategory || '',
                                    bookmarkCategories: [],
                                    videoData: video
                                };
                            }
                            if (!bookmarkData[videoId].bookmarkCategories.includes(categoryName)) {
                                bookmarkData[videoId].bookmarkCategories.push(categoryName);
                            }
                        });
                    });
                }
                
                updateBookmarkCount();
            } catch (error) {
                console.error('Bookmark load error:', error);
                bookmarkCategoryList = [];
            }
        }

        // ブックマークされているか確認
        function isBookmarked(videoId) {
            if (videoId === undefined || videoId === null || String(videoId) === '[object Object]') {
                return false;
            }
            return bookmarkData[videoId] && bookmarkData[videoId].bookmarkCategories && bookmarkData[videoId].bookmarkCategories.length > 0;
        }

        // ブックマークIDリストを取得
        function getBookmarkedIds() {
            return Object.keys(bookmarkData)
                .filter(id => {
                    // 無効なIDを除外
                    if (id === '' || id === 'undefined' || id === 'null' || id === '[object Object]') {
                        return false;
                    }
                    return isBookmarked(id);
                })
                .map(id => {
                    const num = parseInt(id);
                    return isNaN(num) ? id : num;
                });
        }

        // ローディング表示
        function showLoading(message = '処理中...') {
            document.getElementById('loading-message').textContent = message;
            document.getElementById('loading-overlay').classList.add('active');
        }

        function hideLoading() {
            document.getElementById('loading-overlay').classList.remove('active');
        }

        // 初期化
        document.addEventListener('DOMContentLoaded', () => {
            loadCategories();
            loadVideos();
            loadBookmarkData();
            initDropArea();
            setupInfiniteScroll();
        });

        // ステータス更新
        function updateStatus(status, message) {
            const indicator = document.getElementById('status-indicator');
            const text = document.getElementById('status-text');
            indicator.className = 'status-indicator-mini ' + status;
            
            // エラーの場合、更新案内を追加
            if (message === 'データの読み込みに失敗しました') {
                text.innerHTML = message + ' <span style="color: #ffc107; font-weight: 600;">※右上から更新してください</span>';
            } else {
                text.textContent = message;
            }
        }

        // カテゴリ一覧取得（常に_Categoriesシートから取得）
        async function loadCategories() {
            try {
                const data = await fetchJsonp(CONFIG.GAS_URL + '?action=getCategories');
                
                if (data.error) throw new Error(data.error);
                
                categories = Array.isArray(data) ? data : [];
                if (categories.length === 0) {
                    console.warn('カテゴリが見つかりません。_Categoriesシートを確認してください。');
                }
                updateCategorySelect();
                updateCategoryFilters();
            } catch (error) {
                console.error('Category load error:', error);
                // エラー時は空配列（スプレッドシートから取得できなかった）
                categories = [];
                updateCategorySelect();
                updateCategoryFilters();
                updateStatus('error', 'カテゴリの読み込みに失敗しました');
            }
        }

        // フィルターボタンを更新
        function updateCategoryFilters() {
            const filtersContainer = document.querySelector('.filters');
            filtersContainer.innerHTML = '';
            
            // Allボタン
            const allBtn = document.createElement('button');
            allBtn.className = 'filter-btn' + (currentFilter === 'All' ? ' active' : '');
            allBtn.textContent = 'All';
            allBtn.onclick = () => filterVideos('All');
            filtersContainer.appendChild(allBtn);
            
            // カテゴリボタン
            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn' + (currentFilter === cat ? ' active' : '');
                btn.textContent = cat;
                btn.onclick = () => filterVideos(cat);
                filtersContainer.appendChild(btn);
            });
        }

        // カテゴリ選択肢を更新
        function updateCategorySelect() {
            const select = document.getElementById('video-category');
            if (!select) return;
            const currentValue = select.value;
            
            select.innerHTML = '<option value="">選択してください</option>';
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                select.appendChild(option);
            });
            
            if (currentValue && categories.includes(currentValue)) {
                select.value = currentValue;
            }
        }

        // 動画一覧取得（JSONP方式でCORS回避）+ キャッシュ対応
        const CACHE_KEY = 'sceneGalleryVideos';
        const CACHE_TIME_KEY = 'sceneGalleryVideosTime';
        const CACHE_DURATION = 1 * 60 * 1000; // 1分間キャッシュ（複数人同時アクセス対応）

        async function loadVideos(forceRefresh = false) {
            updateStatus('loading', 'データを読み込み中...');
            
            // キャッシュをチェック（強制更新でない場合）
            if (!forceRefresh) {
                const cached = localStorage.getItem(CACHE_KEY);
                const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
                
                if (cached && cachedTime) {
                    const age = Date.now() - parseInt(cachedTime);
                    if (age < CACHE_DURATION) {
                        // キャッシュから高速表示
                        try {
                            videos = JSON.parse(cached);
                            updateStatus('success', `${videos.length}件の動画を読み込みました（キャッシュ）`);
                            renderGallery();
                            
                            // バックグラウンドで最新データを取得
                            refreshInBackground();
                            return;
                        } catch (e) {
                            console.error('Cache parse error:', e);
                        }
                    }
                }
            }
            
            showLoading('動画データを読み込み中...');
            
            try {
                const data = await fetchJsonp(CONFIG.GAS_URL);
                
                if (data.error) throw new Error(data.error);
                
                videos = Array.isArray(data) ? data : [];
                
                // キャッシュに保存
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
                    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
                } catch (e) {
                    console.warn('Cache save error:', e);
                }
                
                hideLoading();
                updateStatus('success', `${videos.length}件の動画を読み込みました`);
                renderGallery();
            } catch (error) {
                hideLoading();
                console.error('Load error:', error);
                
                // エラー時はキャッシュを試す
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    try {
                        videos = JSON.parse(cached);
                        updateStatus('error', 'オフラインデータを表示中');
                        renderGallery();
                        return;
                    } catch (e) {}
                }
                
                updateStatus('error', 'データの読み込みに失敗しました');
                document.getElementById('gallery').innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <p>データの読み込みに失敗しました</p>
                    </div>
                `;
            }
        }

        // バックグラウンドで最新データを取得
        async function refreshInBackground() {
            try {
                const data = await fetchJsonp(CONFIG.GAS_URL);
                if (data.error) return;
                
                const newVideos = Array.isArray(data) ? data : [];
                
                // データが変わっていたら更新
                if (JSON.stringify(newVideos) !== JSON.stringify(videos)) {
                    videos = newVideos;
                    localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
                    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
                    updateStatus('success', `${videos.length}件の動画を読み込みました`);
                    renderGallery();
                }
            } catch (e) {
                console.warn('Background refresh failed:', e);
            }
        }

        // JSONP fetch（CORS回避用）
        let jsonpCounter = 0;
        function fetchJsonp(url, retries = 2) {
            return new Promise((resolve, reject) => {
                jsonpCounter++;
                const callbackName = 'cb' + jsonpCounter + '_' + Date.now();
                const script = document.createElement('script');
                
                // コールバック関数を先にグローバルに登録
                window[callbackName] = (data) => {
                    cleanup();
                    resolve(data);
                };
                
                const timeout = setTimeout(() => {
                    cleanup();
                    if (retries > 0) {
                        console.log('リトライ中... 残り' + retries + '回');
                        fetchJsonp(url, retries - 1).then(resolve).catch(reject);
                    } else {
                        reject(new Error('リクエストがタイムアウトしました'));
                    }
                }, 60000);
                
                function cleanup() {
                    clearTimeout(timeout);
                    if (window[callbackName]) delete window[callbackName];
                    if (script.parentNode) script.parentNode.removeChild(script);
                }
                
                script.onerror = () => {
                    cleanup();
                    if (retries > 0) {
                        console.log('エラー発生、リトライ中... 残り' + retries + '回');
                        fetchJsonp(url, retries - 1).then(resolve).catch(reject);
                    } else {
                        reject(new Error('スクリプトの読み込みに失敗しました'));
                    }
                };
                
                // キャッシュ回避用のタイムスタンプを追加
                const cacheBuster = '_t=' + Date.now();
                const separator = url.includes('?') ? '&' : '?';
                script.src = url + separator + 'callback=' + callbackName + '&' + cacheBuster;
                document.body.appendChild(script);
            });
        }

        // ギャラリー描画
        // 無限スクロール用の設定
        const ITEMS_PER_PAGE = 15;
        let displayedCount = ITEMS_PER_PAGE;
        let isLoadingMore = false;

        function renderGallery(reset = true) {
            const gallery = document.getElementById('gallery');
            const filteredVideos = getFilteredVideos();
            
            // リセット時は表示数を初期化
            if (reset) {
                displayedCount = ITEMS_PER_PAGE;
            }
            
            // ブックマークカウント更新
            updateBookmarkCount();
            
            if (filteredVideos.length === 0) {
                let emptyMessage = '動画がありません';
                let emptyIcon = 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z';
                
                // ブックマークページモード
                if (currentPageMode === 'bookmark') {
                    if (bookmarkSearchQuery) {
                        emptyMessage = `「${bookmarkSearchQuery}」に一致するブックマークがありません`;
                        emptyIcon = 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
                    } else if (currentBookmarkFilter !== 'All') {
                        emptyMessage = `「${currentBookmarkFilter}」カテゴリにブックマークがありません`;
                        emptyIcon = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z';
                    } else {
                        emptyMessage = 'ブックマークがありません<br><span style="font-size:0.9em;opacity:0.7;">動画カードの♡ボタンでブックマークできます</span>';
                        emptyIcon = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z';
                    }
                }
                // メインページモード
                else if (currentFilter === 'Bookmarks') {
                    emptyMessage = 'ブックマークした動画がありません';
                    emptyIcon = 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z';
                } else if (searchQuery) {
                    emptyMessage = `「${searchQuery}」に一致する動画がありません`;
                    emptyIcon = 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
                }
                
                gallery.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24"><path d="${emptyIcon}"/></svg>
                        <p>${emptyMessage}</p>
                    </div>
                `;
                return;
            }
            
            // 表示する動画を制限
            const videosToShow = filteredVideos.slice(0, displayedCount);
            const hasMore = displayedCount < filteredVideos.length;
            
            gallery.innerHTML = videosToShow.map((video, index) => {
                const thumbnail = video.thumbnail || getDefaultThumbnail(video);
                const source = video.source || 'unknown';
                const isExternal = isExternalLink(video);
                const sourceLabel = isExternal ? getExternalLinkDomain(video.videoUrl) : ({
                    youtube: 'YouTube',
                    vimeo: 'Vimeo',
                    instagram: 'Instagram',
                    dropbox: 'Dropbox',
                    unknown: 'Other'
                }[source] || source);
                const videoId = video.id !== undefined ? video.id : index;
                const bookmarked = isBookmarked(videoId);
                const isSelected = selectedVideos.has(videoId);
                const canDownload = source === 'dropbox';
                
                // 外部リンクの場合はリンクアイコン、それ以外は再生アイコン
                const overlayIcon = isExternal 
                    ? '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>'
                    : '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
                
                return `
                    <article class="video-card ${isSelected ? 'selected' : ''} ${isExternal ? 'external-link' : ''}" data-index="${index}" data-id="${video.id}" data-external="${isExternal}" onclick="handleCardClick(${index}, event)">
                        <div class="thumbnail-wrapper">
                            <img class="thumbnail" src="${thumbnail}" alt="${video.title}" loading="lazy" 
                                onload="handleThumbnailLoad(this, '${video.videoUrl || ''}')"
                                onerror="this.src='https://via.placeholder.com/640x360/1a1a1a/333?text=No+Thumbnail'">
                            <div class="play-overlay">
                                <div class="play-btn ${isExternal ? 'link-btn' : ''}">
                                    ${overlayIcon}
                                </div>
                            </div>
                            <span class="source-badge ${source} ${isExternal ? 'external' : ''}">${sourceLabel}</span>
                        </div>
                        <div class="card-content">
                            <div class="card-meta">
                                <span class="category">${video.category || 'Uncategorized'}</span>
                                <span class="date">${video.date || ''}</span>
                            </div>
                            <h3 class="card-title">${video.title || 'Untitled'}</h3>
                            <div class="card-actions" onclick="event.stopPropagation()">
                                <button class="action-btn bookmark-btn ${bookmarked ? 'active' : ''}" onclick="toggleBookmark(${index}, event)" title="ブックマーク">
                                    <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                                </button>
                                <button class="action-btn edit-btn" onclick="openEditModal(${index}, event)" title="編集">
                                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                                </button>
                                <button class="action-btn download-btn ${canDownload ? '' : 'disabled'}" onclick="${canDownload ? `downloadVideo(${index}, event)` : 'event.stopPropagation()'}" title="${canDownload ? 'ダウンロード' : 'この動画はダウンロードできません'}" ${canDownload ? '' : 'disabled'}>
                                    <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                                </button>
                                <button class="action-btn delete-btn" onclick="deleteVideo(${index}, event)" title="削除">
                                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                </button>
                            </div>
                        </div>
                    </article>
                `;
            }).join('');
            
            // もっと読み込むボタンを追加
            if (hasMore) {
                gallery.innerHTML += `
                    <div class="load-more-container" id="load-more-trigger">
                        <button class="load-more-btn" onclick="loadMoreVideos()">
                            もっと見る（残り ${filteredVideos.length - displayedCount} 件）
                        </button>
                    </div>
                `;
            }
        }

        // 追加読み込み
        function loadMoreVideos() {
            if (isLoadingMore) return;
            isLoadingMore = true;
            
            displayedCount += ITEMS_PER_PAGE;
            renderGallery(false);
            
            isLoadingMore = false;
        }

        // 無限スクロール（Intersection Observer）
        function setupInfiniteScroll() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !isLoadingMore) {
                        loadMoreVideos();
                    }
                });
            }, { rootMargin: '200px' });
            
            // ギャラリーの変更を監視
            const galleryObserver = new MutationObserver(() => {
                const trigger = document.getElementById('load-more-trigger');
                if (trigger) {
                    observer.observe(trigger);
                }
            });
            
            galleryObserver.observe(document.getElementById('gallery'), { childList: true });
        }

        function getDefaultThumbnail(video) {
            if (video.videoUrl?.includes('youtube.com') || video.videoUrl?.includes('youtu.be')) {
                const videoId = extractYoutubeId(video.videoUrl);
                // hqdefaultは必ず存在する
                if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
            // Instagramはロゴをサムネイルとして表示
            if (video.videoUrl?.includes('instagram.com') || video.source === 'instagram') {
                return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#f09433"/><stop offset="25%" style="stop-color:#e6683c"/><stop offset="50%" style="stop-color:#dc2743"/><stop offset="75%" style="stop-color:#cc2366"/><stop offset="100%" style="stop-color:#bc1888"/></linearGradient></defs><rect width="640" height="360" fill="#1a1a1a"/><g transform="translate(270,130)"><rect x="0" y="0" width="100" height="100" rx="22" fill="none" stroke="url(#ig)" stroke-width="6"/><circle cx="50" cy="50" r="24" fill="none" stroke="url(#ig)" stroke-width="6"/><circle cx="76" cy="24" r="6" fill="url(#ig)"/></g></svg>`);
            }
            return 'https://via.placeholder.com/640x360/1a1a1a/333?text=Video';
        }

        // サムネイル読み込み時にYouTubeの灰色プレースホルダーをチェック
        function handleThumbnailLoad(img, videoUrl) {
            // YouTubeの灰色プレースホルダーは120x90
            if (img.naturalWidth === 120 && img.naturalHeight === 90) {
                // maxresdefaultが灰色だった場合、hqdefaultにフォールバック
                if (img.src.includes('maxresdefault')) {
                    const videoId = extractYoutubeId(videoUrl);
                    if (videoId) {
                        img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                    }
                } else {
                    img.src = 'https://via.placeholder.com/640x360/1a1a1a/333?text=No+Thumbnail';
                }
            }
        }

        function filterVideos(category) {
            currentFilter = category;
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent === category);
            });
            // Bookmarksリンクの状態を更新
            const bookmarkLink = document.getElementById('bookmark-link');
            if (bookmarkLink) {
                bookmarkLink.classList.toggle('active', category === 'Bookmarks');
            }
            renderGallery();
        }

        // 検索機能
        function searchVideos() {
            const input = document.getElementById('search-input');
            const clearBtn = document.getElementById('search-clear');
            searchQuery = input.value.trim().toLowerCase();
            
            clearBtn.style.display = searchQuery ? 'block' : 'none';
            renderGallery();
        }

        function clearSearch() {
            document.getElementById('search-input').value = '';
            document.getElementById('search-clear').style.display = 'none';
            searchQuery = '';
            renderGallery();
        }

        // ブックマークカウント更新
        function updateBookmarkCount() {
            const countEl = document.getElementById('bookmark-count');
            const count = getBookmarkedIds().length;
            if (countEl) {
                countEl.textContent = count;
                countEl.style.display = count > 0 ? 'flex' : 'none';
            }
        }

        // ブックマーク切り替え（モーダルを開く）
        function toggleBookmark(index, event) {
            event.stopPropagation();
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            const videoId = video.id !== undefined ? video.id : index;
            
            // ブックマークモーダルを開く（既存でも追加・変更可能）
            openBookmarkModal(video, index);
        }

        // ブックマークモーダルを開く
        function openBookmarkModal(video, index) {
            const modal = document.getElementById('bookmark-modal');
            const checkboxContainer = document.getElementById('bookmark-category-checkboxes');
            const videoId = video.id !== undefined ? video.id : index;
            
            // 現在選択されているカテゴリを取得
            const currentCategories = bookmarkData[videoId]?.bookmarkCategories || [];
            
            // チェックボックスリストを生成
            checkboxContainer.innerHTML = bookmarkCategoryList.map(cat => `
                <label class="bookmark-checkbox-label">
                    <input type="checkbox" value="${cat}" ${currentCategories.includes(cat) ? 'checked' : ''}>
                    <span>${cat}</span>
                </label>
            `).join('');
            
            // 動画情報を保存
            modal.dataset.videoId = videoId;
            modal.dataset.videoCategory = video.category || 'Uncategorized';
            modal.dataset.videoTitle = video.title || 'Untitled';
            
            document.getElementById('bookmark-video-title').textContent = video.title || 'Untitled';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // ブックマークモーダルを閉じる
        function closeBookmarkModal() {
            const modal = document.getElementById('bookmark-modal');
            modal.classList.remove('active');
            modal.dataset.bulkMode = 'false';
            document.body.style.overflow = '';
        }

        // ブックマークを保存（スプレッドシートに保存）
        async function saveBookmark() {
            const modal = document.getElementById('bookmark-modal');
            
            // 複数選択モードの場合
            if (modal.dataset.bulkMode === 'true') {
                await saveBulkBookmark();
                return;
            }
            
            const videoId = modal.dataset.videoId;
            const videoCategory = modal.dataset.videoCategory;
            
            // 対象の動画を取得（IDを文字列として比較）
            const video = videos.find(v => String(v.id) === String(videoId));
            if (!video) {
                alert('動画が見つかりません');
                return;
            }
            
            // チェックされたカテゴリを取得
            const checkboxes = document.querySelectorAll('#bookmark-category-checkboxes input[type="checkbox"]:checked');
            const selectedCategories = Array.from(checkboxes).map(cb => cb.value);
            
            // 現在のカテゴリ
            const currentCategories = bookmarkData[videoId]?.bookmarkCategories || [];
            
            showLoading('ブックマークを保存中...');
            
            try {
                // 追加されたカテゴリ
                const addedCategories = selectedCategories.filter(cat => !currentCategories.includes(cat));
                // 削除されたカテゴリ
                const removedCategories = currentCategories.filter(cat => !selectedCategories.includes(cat));
                
                // 追加処理
                for (const cat of addedCategories) {
                    await postToGas({
                        action: 'addBookmark',
                        bookmarkCategory: cat,
                        video: {
                            id: video.id,
                            title: video.title,
                            description: video.description,
                            date: video.date,
                            thumbnail: video.thumbnail,
                            videoUrl: video.videoUrl,
                            source: video.source,
                            category: video.category
                        }
                    });
                }
                
                // 削除処理
                for (const cat of removedCategories) {
                    await postToGas({
                        action: 'removeBookmark',
                        bookmarkCategory: cat,
                        videoId: videoId
                    });
                }
                
                // ローカルデータを更新
                if (selectedCategories.length === 0) {
                    delete bookmarkData[videoId];
                } else {
                    bookmarkData[videoId] = { 
                        category: videoCategory,
                        bookmarkCategories: selectedCategories,
                        videoData: video
                    };
                }
                
                hideLoading();
                closeBookmarkModal();
                updateBookmarkCount();
                renderGallery();
                updateStatus('', 'ブックマークを保存しました');
                
            } catch (error) {
                hideLoading();
                console.error('Bookmark save error:', error);
                alert('ブックマークの保存に失敗しました');
            }
        }

        // 新しいブックマークカテゴリを追加
        function showAddBookmarkCategoryModal() {
            document.getElementById('add-bookmark-category-modal').classList.add('active');
        }

        function closeAddBookmarkCategoryModal() {
            document.getElementById('add-bookmark-category-modal').classList.remove('active');
            document.getElementById('new-bookmark-category-name').value = '';
        }

        async function addBookmarkCategory() {
            const name = document.getElementById('new-bookmark-category-name').value.trim();
            if (!name) {
                alert('カテゴリ名を入力してください');
                return;
            }
            
            if (bookmarkCategoryList.includes(name)) {
                alert('このカテゴリは既に存在します');
                return;
            }
            
            showLoading('カテゴリを追加中...');
            
            try {
                // スプレッドシートに追加
                await postToGas({
                    action: 'addBookmarkCategory',
                    name: name
                });
                
                bookmarkCategoryList.push(name);
                
                // チェックボックスリストを更新（新しいカテゴリをチェック済みで追加）
                const checkboxContainer = document.getElementById('bookmark-category-checkboxes');
                const currentChecked = Array.from(checkboxContainer.querySelectorAll('input:checked')).map(cb => cb.value);
                currentChecked.push(name);
                
                checkboxContainer.innerHTML = bookmarkCategoryList.map(cat => `
                    <label class="bookmark-checkbox-label">
                        <input type="checkbox" value="${cat}" ${currentChecked.includes(cat) ? 'checked' : ''}>
                        <span>${cat}</span>
                    </label>
                `).join('');
                
                hideLoading();
                closeAddBookmarkCategoryModal();
                
                // ブックマーク一覧モーダルからの追加の場合、カテゴリボタンを更新
                if (window.addBookmarkCategoryFromModal) {
                    window.addBookmarkCategoryFromModal = false;
                    renderBookmarksCategoryButtons();
                }
                
            } catch (error) {
                hideLoading();
                console.error('Add category error:', error);
                alert('カテゴリの追加に失敗しました');
            }
        }

        // ブックマークカテゴリ編集用
        let editingBookmarkCategory = null;

        function openEditBookmarkCategoryModal(categoryName) {
            editingBookmarkCategory = categoryName;
            document.getElementById('edit-bookmark-category-name').value = categoryName;
            document.getElementById('edit-bookmark-category-modal').classList.add('active');
        }

        function closeEditBookmarkCategoryModal() {
            document.getElementById('edit-bookmark-category-modal').classList.remove('active');
            editingBookmarkCategory = null;
        }

        async function saveBookmarkCategoryName() {
            const newName = document.getElementById('edit-bookmark-category-name').value.trim();
            
            if (!newName) {
                alert('カテゴリ名を入力してください');
                return;
            }
            
            if (newName === editingBookmarkCategory) {
                closeEditBookmarkCategoryModal();
                return;
            }
            
            if (bookmarkCategoryList.includes(newName)) {
                alert('このカテゴリ名は既に存在します');
                return;
            }
            
            showLoading('カテゴリ名を変更中...');
            
            try {
                await postToGas({
                    action: 'renameBookmarkCategory',
                    oldName: editingBookmarkCategory,
                    newName: newName
                });
                
                // ローカルのカテゴリリストを更新
                const index = bookmarkCategoryList.indexOf(editingBookmarkCategory);
                if (index !== -1) {
                    bookmarkCategoryList[index] = newName;
                }
                
                // bookmarkDataのカテゴリ名も更新
                Object.keys(bookmarkData).forEach(videoId => {
                    const cats = bookmarkData[videoId].bookmarkCategories;
                    const catIndex = cats.indexOf(editingBookmarkCategory);
                    if (catIndex !== -1) {
                        cats[catIndex] = newName;
                    }
                });
                
                // フィルターも更新
                if (currentBookmarkFilter === editingBookmarkCategory) {
                    currentBookmarkFilter = newName;
                }
                
                hideLoading();
                closeEditBookmarkCategoryModal();
                renderBookmarksCategoryButtons();
                updateStatus('', 'カテゴリ名を変更しました');
                
            } catch (error) {
                hideLoading();
                console.error('Rename category error:', error);
                alert('カテゴリ名の変更に失敗しました');
            }
        }

        async function deleteBookmarkCategory() {
            const categoryName = editingBookmarkCategory;
            
            const confirmed = await showConfirmModal(`「${categoryName}」カテゴリを削除しますか？\nこのカテゴリのブックマークも全て削除されます。`, 'カテゴリを削除', '削除');
            if (!confirmed) {
                return;
            }
            
            showLoading('カテゴリを削除中...');
            
            try {
                await postToGas({
                    action: 'deleteBookmarkCategory',
                    name: categoryName
                });
                
                // ローカルのカテゴリリストから削除
                const index = bookmarkCategoryList.indexOf(categoryName);
                if (index !== -1) {
                    bookmarkCategoryList.splice(index, 1);
                }
                
                // bookmarkDataからこのカテゴリを削除
                Object.keys(bookmarkData).forEach(videoId => {
                    const cats = bookmarkData[videoId].bookmarkCategories;
                    const catIndex = cats.indexOf(categoryName);
                    if (catIndex !== -1) {
                        cats.splice(catIndex, 1);
                    }
                    // カテゴリがなくなったら、bookmarkDataから削除
                    if (cats.length === 0) {
                        delete bookmarkData[videoId];
                    }
                });
                
                // フィルターをリセット
                currentBookmarkFilter = 'All';
                
                hideLoading();
                closeEditBookmarkCategoryModal();
                renderBookmarksCategoryButtons();
                renderBookmarksGrid();
                updateBookmarkCount();
                renderGallery();
                updateStatus('', 'カテゴリを削除しました');
                
            } catch (error) {
                hideLoading();
                console.error('Delete category error:', error);
                alert('カテゴリの削除に失敗しました');
            }
        }

        // フィルタリングされた動画を取得
        // ===== あいまい検索 =====
        // ひらがな→カタカナ変換
        function hiraganaToKatakana(str) {
            return str.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
        }

        // カタカナ→ひらがな変換
        function katakanaToHiragana(str) {
            return str.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
        }

        // 口語表現・略語の同義語マップ
        const synonymMap = {
            'かっこいい': ['カッコイイ', 'かっこ良い', 'カッコ良い', 'かっけー', 'カッケー', 'かっけえ', 'イケてる', 'クール', 'cool'],
            'かわいい': ['カワイイ', '可愛い', 'かわいー', 'カワイー', 'きゃわいい', 'キャワイイ', 'cute'],
            'すごい': ['スゴイ', '凄い', 'すげー', 'スゲー', 'すげえ', 'やばい', 'ヤバイ', 'やばっ'],
            'おしゃれ': ['オシャレ', 'お洒落', 'おっしゃれ', 'シャレオツ'],
            'おもしろい': ['オモシロイ', '面白い', 'おもろい', 'オモロイ', 'ウケる', 'うける'],
            'きれい': ['キレイ', '綺麗', 'きれー', 'キレー', '美しい', 'うつくしい'],
            'たのしい': ['タノシイ', '楽しい', 'たのしー', 'タノシー'],
            'うれしい': ['ウレシイ', '嬉しい', 'うれしー', 'ウレシー'],
            'かなしい': ['カナシイ', '悲しい', 'かなしー', 'カナシー', 'せつない', 'セツナイ', '切ない'],
            'やさしい': ['ヤサシイ', '優しい', 'やさしー', 'ヤサシー'],
            'つよい': ['ツヨイ', '強い', 'つえー', 'ツエー', 'つええ'],
            'はやい': ['ハヤイ', '速い', '早い', 'はえー', 'ハエー', 'はええ'],
            'あつい': ['アツイ', '熱い', '暑い', 'あちー', 'アチー', 'あちい'],
            'さむい': ['サムイ', '寒い', 'さみー', 'サミー', 'さみい'],
            'おおきい': ['オオキイ', '大きい', 'でかい', 'デカイ', 'でけー', 'デケー'],
            'ちいさい': ['チイサイ', '小さい', 'ちっさい', 'チッサイ', 'ちっちゃい'],
            'あたらしい': ['アタラシイ', '新しい', 'ニュー', 'new'],
            'ふるい': ['フルイ', '古い', 'レトロ', 'retro', 'ビンテージ', 'vintage'],
            'いい': ['イイ', '良い', 'よい', 'ヨイ', 'ええ', 'エエ', 'good', 'グッド', 'ナイス', 'nice'],
            'わるい': ['ワルイ', '悪い', 'bad', 'バッド'],
            'シンプル': ['しんぷる', 'simple', 'シンプルな'],
            'ポップ': ['ぽっぷ', 'pop', 'ポップな'],
            'ダーク': ['だーく', 'dark', 'ダークな', '暗い', 'くらい'],
            'エモい': ['えもい', 'エモ', 'えも', 'emotional'],
            'チル': ['ちる', 'chill', 'チルい', 'ちるい'],
        };

        // 検索クエリの拡張（同義語を含む）
        function expandSearchQuery(query) {
            const normalizedQuery = query.toLowerCase();
            const hiraganaQuery = katakanaToHiragana(normalizedQuery);
            const katakanaQuery = hiraganaToKatakana(normalizedQuery);
            
            const queries = new Set([normalizedQuery, hiraganaQuery, katakanaQuery]);
            
            // 同義語マップから一致するものを追加
            for (const [key, synonyms] of Object.entries(synonymMap)) {
                const allForms = [key, ...synonyms].map(s => s.toLowerCase());
                const allFormsHiragana = allForms.map(s => katakanaToHiragana(s));
                const allFormsKatakana = allForms.map(s => hiraganaToKatakana(s));
                const allVariants = [...allForms, ...allFormsHiragana, ...allFormsKatakana];
                
                if (allVariants.some(v => v.includes(normalizedQuery) || v.includes(hiraganaQuery) || v.includes(katakanaQuery))) {
                    allForms.forEach(s => queries.add(s));
                    allFormsHiragana.forEach(s => queries.add(s));
                    allFormsKatakana.forEach(s => queries.add(s));
                }
            }
            
            return Array.from(queries);
        }

        // テキストがクエリにあいまい一致するか
        function fuzzyMatch(text, searchQueries) {
            if (!text) return false;
            const normalizedText = text.toLowerCase();
            const hiraganaText = katakanaToHiragana(normalizedText);
            const katakanaText = hiraganaToKatakana(normalizedText);
            
            return searchQueries.some(q => 
                normalizedText.includes(q) || 
                hiraganaText.includes(q) || 
                katakanaText.includes(q)
            );
        }

        function getFilteredVideos() {
            let filtered = videos;
            
            // ブックマークページモードの場合
            if (currentPageMode === 'bookmark') {
                // ブックマークされた動画のみ
                filtered = videos.filter((v, idx) => {
                    const vid = v.id !== undefined ? v.id : idx;
                    return isBookmarked(vid);
                });
                
                // ブックマークカテゴリフィルター
                if (currentBookmarkFilter !== 'All') {
                    filtered = filtered.filter((v, idx) => {
                        const vid = v.id !== undefined ? v.id : idx;
                        const data = bookmarkData[vid];
                        const cats = data?.bookmarkCategories || ['お気に入り'];
                        return cats.includes(currentBookmarkFilter);
                    });
                }
                
                // ブックマーク検索フィルター
                if (bookmarkSearchQuery) {
                    const searchQueries = expandSearchQuery(bookmarkSearchQuery);
                    filtered = filtered.filter(v => 
                        fuzzyMatch(v.title, searchQueries) ||
                        fuzzyMatch(v.description, searchQueries)
                    );
                }
                
                // ブックマークページ用ソート
                filtered = sortVideoList(filtered, bookmarkPageSort);
                
                return filtered;
            }
            
            // メインページモードの場合（従来の処理）
            // カテゴリフィルター
            if (currentFilter === 'Bookmarks') {
                filtered = videos.filter((v, idx) => {
                    const vid = v.id !== undefined ? v.id : idx;
                    return isBookmarked(vid);
                });
            } else if (currentFilter !== 'All') {
                filtered = videos.filter(v => v.category === currentFilter);
            }
            
            // あいまい検索フィルター
            if (searchQuery) {
                const searchQueries = expandSearchQuery(searchQuery);
                filtered = filtered.filter(v => 
                    fuzzyMatch(v.title, searchQueries) ||
                    fuzzyMatch(v.description, searchQueries)
                );
            }
            
            // ソート
            filtered = sortVideoList(filtered, currentSort);
            
            return filtered;
        }

        // ソート関数
        function sortVideoList(videoList, sortType) {
            const sorted = [...videoList];
            
            switch (sortType) {
                case 'date-desc':
                    // 追加日（新しい順）
                    sorted.sort((a, b) => {
                        const dateA = String(a.date || '').replace(/\./g, '/');
                        const dateB = String(b.date || '').replace(/\./g, '/');
                        return dateB.localeCompare(dateA);
                    });
                    break;
                case 'date-asc':
                    // 追加日（古い順）
                    sorted.sort((a, b) => {
                        const dateA = String(a.date || '').replace(/\./g, '/');
                        const dateB = String(b.date || '').replace(/\./g, '/');
                        return dateA.localeCompare(dateB);
                    });
                    break;
                case 'title-asc':
                    // タイトル順（あいうえお順・A-Z）
                    sorted.sort((a, b) => {
                        const titleA = String(a.title || '').toLowerCase();
                        const titleB = String(b.title || '').toLowerCase();
                        return titleA.localeCompare(titleB, 'ja');
                    });
                    break;
                case 'source':
                    // ソース別（YouTube → Vimeo → Dropbox → External）
                    const sourceOrder = { youtube: 1, vimeo: 2, dropbox: 3, external: 4, unknown: 5 };
                    sorted.sort((a, b) => {
                        const orderA = sourceOrder[a.source] || 5;
                        const orderB = sourceOrder[b.source] || 5;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        // 同じソース内では追加日順
                        const dateA = String(a.date || '').replace(/\./g, '/');
                        const dateB = String(b.date || '').replace(/\./g, '/');
                        return dateB.localeCompare(dateA);
                    });
                    break;
            }
            
            return sorted;
        }

        // ソート変更
        function sortVideos() {
            const select = document.getElementById('sort-select');
            currentSort = select.value;
            renderGallery();
        }

        // 動画ダウンロード
        async function downloadVideo(index, event) {
            event.stopPropagation();
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            
            if (video.source === 'dropbox' && video.videoUrl) {
                showLoading('ダウンロード準備中...');
                
                try {
                    const filename = (video.title || 'video') + '.mp4';
                    const url = `${CONFIG.GAS_URL}?action=downloadFile&url=${encodeURIComponent(video.videoUrl)}&filename=${encodeURIComponent(filename)}`;
                    
                    const response = await fetch(url);
                    const result = await response.json();
                    
                    if (result.error) {
                        throw new Error(result.error);
                    }
                    
                    // Base64データをBlobに変換
                    const byteCharacters = atob(result.data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: result.contentType });
                    
                    // ダウンロードリンクを作成
                    const downloadUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = result.filename || filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(downloadUrl);
                    
                    hideLoading();
                } catch (error) {
                    hideLoading();
                    console.error('Download error:', error);
                    alert('ダウンロードに失敗しました: ' + error.message);
                }
            } else if (video.source === 'youtube') {
                alert('YouTube動画は直接ダウンロードできません。\nYouTubeのサイトでご確認ください。');
            } else if (video.source === 'vimeo') {
                alert('Vimeo動画は直接ダウンロードできません。\nVimeoのサイトでご確認ください。');
            } else if (video.source === 'instagram') {
                alert('Instagram動画は直接ダウンロードできません。\nInstagramのサイトでご確認ください。');
            } else {
                alert('この動画はダウンロードできません。');
            }
        }

        // 動画削除
        async function deleteVideo(index, event) {
            event.stopPropagation();
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            
            const confirmed = await showConfirmModal(`「${video.title}」をゴミ箱に移動しますか？`, 'ゴミ箱に移動', '移動');
            if (!confirmed) {
                return;
            }
            
            showLoading('ゴミ箱に移動中...');
            
            try {
                // スプレッドシートから削除
                await postToGas({
                    action: 'deleteVideo',
                    id: video.id,
                    category: video.category
                });
                
                hideLoading();
                
                // ゴミ箱に追加
                moveToTrash(video);
                
                // ブックマークからは削除しない（復元時に残したいため）
                
                videos = videos.filter(v => v.id !== video.id);
                renderGallery();
                updateBookmarkCount();
                updateStatus('', 'ゴミ箱に移動しました');
            } catch (error) {
                hideLoading();
                console.error('Delete error:', error);
                
                // エラーが出ても、ゴミ箱に移動
                moveToTrash(video);
                videos = videos.filter(v => v.id !== video.id);
                renderGallery();
                updateBookmarkCount();
                updateStatus('', 'ゴミ箱に移動しました');
            }
        }

        // 選択した動画をゴミ箱に移動
        async function moveSelectedToTrash() {
            const count = selectedVideos.size;
            if (count === 0) {
                alert('動画を選択してください');
                return;
            }
            
            const confirmed = await showConfirmModal(`選択した${count}件の動画をゴミ箱に移動しますか？`, 'ゴミ箱に移動', '移動');
            if (!confirmed) {
                return;
            }
            
            showLoading(`${count}件の動画をゴミ箱に移動中...`);
            
            // 選択された動画を取得
            const videosToDelete = videos.filter((v, idx) => {
                const vid = v.id !== undefined ? v.id : idx;
                return selectedVideos.has(vid);
            });
            
            for (const video of videosToDelete) {
                try {
                    await postToGas({
                        action: 'deleteVideo',
                        id: video.id,
                        category: video.category
                    });
                } catch (error) {
                    console.error('Delete error for video:', video.id, error);
                }
                
                // ゴミ箱に追加
                moveToTrash(video);
            }
            
            // ローカルデータから削除
            videos = videos.filter((v, idx) => {
                const vid = v.id !== undefined ? v.id : idx;
                return !selectedVideos.has(vid);
            });
            
            hideLoading();
            exitSelectMode();
            renderGallery();
            updateBookmarkCount();
            updateStatus('', `${count}件の動画をゴミ箱に移動しました`);
        }

        // 編集中の動画情報
        let editingVideo = null;

        // 編集モーダルを開く
        function openEditModal(index, event) {
            event.stopPropagation();
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            editingVideo = video;
            
            // フォームに現在の値をセット
            document.getElementById('edit-video-title').textContent = video.title || 'Untitled';
            document.getElementById('edit-title-input').value = video.title || '';
            document.getElementById('edit-features-input').value = video.description || '';
            
            // カテゴリ選択肢を更新
            const categorySelect = document.getElementById('edit-category-select');
            categorySelect.innerHTML = categories.map(cat => 
                `<option value="${cat}" ${video.category === cat ? 'selected' : ''}>${cat}</option>`
            ).join('');
            
            document.getElementById('edit-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // 編集モーダルを閉じる
        function closeEditModal() {
            document.getElementById('edit-modal').classList.remove('active');
            document.body.style.overflow = '';
            editingVideo = null;
        }

        // 編集内容を保存
        async function saveVideoEdit() {
            if (!editingVideo) return;
            
            const newTitle = document.getElementById('edit-title-input').value.trim();
            const newFeatures = document.getElementById('edit-features-input').value.trim();
            const newCategory = document.getElementById('edit-category-select').value;
            
            if (!newTitle) {
                alert('タイトルを入力してください');
                return;
            }
            
            showLoading('保存中...');
            
            try {
                const result = await postToGas({
                    action: 'updateVideo',
                    id: editingVideo.id,
                    oldCategory: editingVideo.category,
                    newCategory: newCategory,
                    title: newTitle,
                    description: newFeatures
                });
                
                hideLoading();
                
                if (result.success) {
                    // ローカルのデータも更新
                    const videoIndex = videos.findIndex(v => v.id === editingVideo.id);
                    if (videoIndex !== -1) {
                        videos[videoIndex].title = newTitle;
                        videos[videoIndex].description = newFeatures;
                        videos[videoIndex].category = newCategory;
                    }
                    
                    closeEditModal();
                    renderGallery();
                    updateStatus('', '更新完了');
                } else {
                    alert('更新に失敗しました: ' + (result.error || '不明なエラー'));
                }
            } catch (error) {
                hideLoading();
                console.error('Update error:', error);
                alert('更新に失敗しました: ' + error.message);
            }
        }

        function extractYoutubeId(url) {
            if (!url) return null;
            const patterns = [
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
                /^([a-zA-Z0-9_-]{11})$/
            ];
            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) return match[1];
            }
            return null;
        }

        // アップロードモーダル表示
        function showUploadModal() {
            document.getElementById('upload-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // アップロードモーダル閉じる
        function closeUploadModal() {
            document.getElementById('upload-modal').classList.remove('active');
            document.body.style.overflow = '';
            resetUploadForm();
        }

        // アップロードタイプ選択
        function selectUploadType(type) {
            currentUploadType = type;
            document.querySelectorAll('.upload-type-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector(`.${type}-type`).classList.add('active');
            
            // 全入力エリアを非表示
            document.getElementById('url-input').style.display = 'none';
            document.getElementById('file-input').style.display = 'none';
            document.getElementById('link-input').style.display = 'none';
            document.getElementById('thumbnail-url-group').style.display = 'none';
            document.getElementById('link-thumbnail-group').style.display = 'none';
            
            // 選択されたタイプに応じて表示
            if (type === 'url') {
                document.getElementById('url-input').style.display = 'block';
            } else if (type === 'dropbox') {
                document.getElementById('file-input').style.display = 'block';
                document.getElementById('thumbnail-url-group').style.display = 'block';
            } else if (type === 'link') {
                document.getElementById('link-input').style.display = 'block';
                document.getElementById('link-thumbnail-group').style.display = 'block';
            }
        }

        // 外部リンクURL変更時（OGP自動取得）
        let ogpFetchTimeout = null;
        async function onExternalLinkChange() {
            const url = document.getElementById('external-link-url').value.trim();
            const preview = document.getElementById('link-thumbnail-preview');
            const img = document.getElementById('link-thumbnail-img');
            const thumbnailInput = document.getElementById('link-thumbnail-url');
            const titleInput = document.getElementById('video-title');
            const warning = document.getElementById('link-duplicate-warning');
            const warningTitle = document.getElementById('link-duplicate-title');
            
            // 重複警告をリセット
            warning.classList.remove('active');
            
            if (!url) {
                preview.classList.remove('active');
                return;
            }
            
            // URL形式チェック
            try {
                new URL(url);
            } catch (e) {
                return;
            }
            
            // 重複チェック（即時）
            const duplicate = checkDuplicate('url', url);
            if (duplicate) {
                warningTitle.textContent = `「${duplicate.title}」`;
                warning.classList.add('active');
            }
            
            // デバウンス処理（入力が止まってから500ms後に取得）
            if (ogpFetchTimeout) clearTimeout(ogpFetchTimeout);
            ogpFetchTimeout = setTimeout(async () => {
                try {
                    // ローディング表示
                    preview.classList.add('active');
                    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23888" font-size="12">読み込み中...</text></svg>';
                    
                    // GAS経由でOGP情報を取得
                    const ogpData = await fetchJsonp(CONFIG.GAS_URL + '?action=fetchOgp&url=' + encodeURIComponent(url));
                    
                    if (ogpData && ogpData.success) {
                        // サムネイルを設定
                        if (ogpData.thumbnail) {
                            thumbnailInput.value = ogpData.thumbnail;
                            img.src = ogpData.thumbnail;
                            img.onload = () => preview.classList.add('active');
                            img.onerror = () => {
                                preview.classList.remove('active');
                                thumbnailInput.value = '';
                            };
                        } else {
                            preview.classList.remove('active');
                        }
                        
                        // タイトルを設定（空の場合のみ）
                        if (ogpData.title && !titleInput.value) {
                            titleInput.value = ogpData.title;
                        }
                        
                        // 特徴・メモは手動入力のため自動取得しない
                    } else {
                        preview.classList.remove('active');
                    }
                } catch (error) {
                    console.error('OGP取得エラー:', error);
                    preview.classList.remove('active');
                }
            }, 500);
        }

        // リンクサムネイル変更時
        function onLinkThumbnailChange() {
            const url = document.getElementById('link-thumbnail-url').value.trim();
            const preview = document.getElementById('link-thumbnail-preview');
            const img = document.getElementById('link-thumbnail-img');
            
            if (url) {
                img.src = url;
                img.onload = () => preview.classList.add('active');
                img.onerror = () => preview.classList.remove('active');
            } else {
                preview.classList.remove('active');
            }
        }

        // 動画URL処理（YouTube/Vimeo/Instagram対応）
        async function onVideoUrlChange() {
            const url = document.getElementById('video-url').value.trim();
            const preview = document.getElementById('url-thumbnail-preview');
            const img = document.getElementById('url-thumbnail-img');
            const badge = document.getElementById('platform-badge');
            const warning = document.getElementById('url-duplicate-warning');
            const warningTitle = document.getElementById('url-duplicate-title');
            
            // 重複警告をリセット
            warning.classList.remove('active');
            
            const platform = await detectPlatform(url);
            detectedPlatform = platform;
            
            if (platform) {
                badge.style.display = 'inline-flex';
                badge.className = 'platform-badge ' + platform.type;
                badge.textContent = platform.name;
                
                if (platform.thumbnail) {
                    img.src = platform.thumbnail;
                    preview.classList.add('active');
                } else {
                    preview.classList.remove('active');
                }
                
                await fetchVideoTitle(url, platform);
                
                // 重複チェック
                const duplicate = checkDuplicate('url', url);
                if (duplicate) {
                    warningTitle.textContent = `「${duplicate.title}」`;
                    warning.classList.add('active');
                }
            } else {
                badge.style.display = 'none';
                preview.classList.remove('active');
                detectedPlatform = null;
            }
        }

        // YouTubeサムネイルを優先順位付きで取得
        async function getYoutubeThumbnail(videoId) {
            const qualities = [
                'maxresdefault',  // 1280x720 (存在しない場合あり)
                'sddefault',      // 640x480
                'hqdefault',      // 480x360
                'mqdefault'       // 320x180 (必ず存在)
            ];
            
            for (const quality of qualities) {
                const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
                try {
                    const exists = await checkImageExists(url);
                    if (exists) {
                        return url;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // フォールバック（mqdefaultは必ず存在する）
            return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        }

        // 画像の存在確認（灰色プレースホルダーでないか確認）
        function checkImageExists(url) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = function() {
                    // YouTubeの灰色プレースホルダーは120x90
                    if (this.width === 120 && this.height === 90) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                };
                img.onerror = function() {
                    resolve(false);
                };
                img.src = url;
            });
        }

        // プラットフォーム検出（非同期）
        async function detectPlatform(url) {
            if (!url) return null;
            
            // YouTube
            const youtubeId = extractYoutubeId(url);
            if (youtubeId) {
                const thumbnail = await getYoutubeThumbnail(youtubeId);
                return {
                    type: 'youtube',
                    name: 'YouTube',
                    id: youtubeId,
                    thumbnail: thumbnail,
                    embedUrl: `https://www.youtube.com/embed/${youtubeId}`
                };
            }
            
            // Vimeo
            const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
            if (vimeoMatch) {
                return {
                    type: 'vimeo',
                    name: 'Vimeo',
                    id: vimeoMatch[1],
                    thumbnail: null,
                    embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`
                };
            }
            
            // Instagram
            const instaMatch = url.match(/(?:instagram\.com\/(?:p|reel|reels|tv)\/)([A-Za-z0-9_-]+)/);
            if (instaMatch) {
                const instaId = instaMatch[1];
                return {
                    type: 'instagram',
                    name: 'Instagram',
                    id: instaId,
                    // サムネイルはnull（ロゴを表示）
                    thumbnail: null,
                    embedUrl: `https://www.instagram.com/p/${instaId}/embed`
                };
            }
            
            // その他のURL
            if (url.match(/^https?:\/\/.+/)) {
                return {
                    type: 'unknown',
                    name: 'その他',
                    id: null,
                    thumbnail: null,
                    embedUrl: url
                };
            }
            
            return null;
        }

        // タイトル自動取得
        async function fetchVideoTitle(url, platform) {
            const titleInput = document.getElementById('video-title');
            if (titleInput.value.trim()) return;
            
            try {
                if (platform.type === 'youtube') {
                    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
                    const response = await fetch(oembedUrl);
                    if (response.ok) {
                        const data = await response.json();
                        titleInput.value = data.title || '';
                    }
                } else if (platform.type === 'vimeo') {
                    // GAS経由でVimeo情報を取得（CORS回避）
                    
                    const vimeoInfo = await fetchVimeoInfo(platform.id);
                    
                    if (vimeoInfo.success) {
                        titleInput.value = vimeoInfo.title || '';
                        if (vimeoInfo.thumbnail) {
                            // detectedPlatformにサムネイルを設定
                            detectedPlatform.thumbnail = vimeoInfo.thumbnail;
                            document.getElementById('url-thumbnail-img').src = vimeoInfo.thumbnail;
                            document.getElementById('url-thumbnail-preview').classList.add('active');
                        }
                    } else {
                        console.error('Vimeo info failed:', vimeoInfo.error);
                    }
                }
            } catch (error) {
                
            }
        }

        // GAS経由でVimeo情報を取得
        async function fetchVimeoInfo(videoId) {
            try {
                const requestUrl = CONFIG.GAS_URL + '?action=getVimeoInfo&videoId=' + videoId;
                
                const data = await fetchJsonp(requestUrl);
                return data;
            } catch (error) {
                console.error('Vimeo info fetch error:', error);
                return { success: false, error: error.message };
            }
        }

        // ファイルアップロード初期化
        function initDropArea() {
            const dropArea = document.getElementById('drop-area');
            const fileInput = document.getElementById('video-file');
            if (!dropArea || !fileInput) return;

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, e => {
                    e.preventDefault();
                    e.stopPropagation();
                }, false);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
            });

            dropArea.addEventListener('drop', e => {
                const files = e.dataTransfer.files;
                if (files.length > 0) handleFile(files[0]);
            }, false);

            dropArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', e => {
                if (e.target.files.length > 0) handleFile(e.target.files[0]);
            });
        }

        async function handleFile(file) {
            if (!file.type.startsWith('video/')) {
                showError('動画ファイルを選択してください');
                return;
            }
            
            // ファイルサイズ警告（50MB以上）
            if (file.size > 50 * 1024 * 1024) {
                const confirmed = await showConfirmModal(`ファイルサイズが${formatFileSize(file.size)}あります。\nアップロードに時間がかかる可能性があります。\n続行しますか？`, 'ファイルサイズ確認', '続行');
                if (!confirmed) {
                    return;
                }
            }
            
            // 100MB制限
            if (file.size > 100 * 1024 * 1024) {
                showError('ファイルサイズは100MB以下にしてください');
                return;
            }
            
            selectedFile = file;
            document.getElementById('file-name').textContent = file.name;
            document.getElementById('file-size').textContent = formatFileSize(file.size);
            document.getElementById('selected-file').style.display = 'flex';
            document.getElementById('drop-area').style.display = 'none';
            hideError();
            
            // 重複チェック
            const warning = document.getElementById('file-duplicate-warning');
            const warningTitle = document.getElementById('file-duplicate-title');
            const duplicate = checkDuplicate('filename', file.name);
            if (duplicate) {
                warningTitle.textContent = `「${duplicate.title}」`;
                warning.classList.add('active');
            } else {
                warning.classList.remove('active');
            }
            
            // ファイル名からタイトルを自動設定
            const titleInput = document.getElementById('video-title');
            if (!titleInput.value.trim()) {
                const titleFromFile = file.name.replace(/\.[^/.]+$/, '')
                    .replace(/[_-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                titleInput.value = titleFromFile;
            }
            
            // 動画の1フレーム目からサムネイルを生成
            generateVideoThumbnail(file);
        }

        // 動画の1フレーム目からサムネイルを生成
        function generateVideoThumbnail(file) {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            
            video.onloadeddata = function() {
                // 最初のフレームにシーク
                video.currentTime = 0.1;
            };
            
            video.onseeked = function() {
                // Canvasに描画してBase64に変換
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                try {
                    // サムネイルをBase64として保存（JPEG形式、品質70%）
                    generatedThumbnail = canvas.toDataURL('image/jpeg', 0.7);
                    
                    // プレビュー表示
                    const preview = document.getElementById('thumbnail-preview');
                    if (preview) {
                        preview.innerHTML = `<img src="${generatedThumbnail}" alt="サムネイル" style="max-width:200px;max-height:120px;border-radius:4px;">`;
                        preview.style.display = 'block';
                    }
                } catch (e) {
                    
                }
                
                // メモリ解放
                URL.revokeObjectURL(video.src);
            };
            
            video.onerror = function() {
                
                URL.revokeObjectURL(video.src);
            };
            
            video.src = URL.createObjectURL(file);
        }

        // 生成されたサムネイル
        let generatedThumbnail = null;

        function removeFile() {
            selectedFile = null;
            generatedThumbnail = null;
            document.getElementById('video-file').value = '';
            document.getElementById('selected-file').style.display = 'none';
            document.getElementById('drop-area').style.display = 'block';
            const preview = document.getElementById('thumbnail-preview');
            if (preview) preview.style.display = 'none';
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
            });
        }

        // GASへのPOST送信（レスポンス不要な操作用）
        async function postToGas(data) {
            try {
                // no-corsモードで送信（レスポンスは取得できないが、リクエストは届く）
                await fetch(CONFIG.GAS_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(data)
                });
                // no-corsの場合、レスポンスは取得できないが、リクエストは成功しているとみなす
                return { success: true };
            } catch (error) {
                console.error('POST error:', error);
                return { success: false, error: error.message };
            }
        }

        // GASへのPOST送信（レスポンスが必要な操作用 - Dropboxアップロードなど）
        async function postToGasWithResponse(data) {
            try {
                const response = await fetch(CONFIG.GAS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(data),
                    redirect: 'follow'
                });
                const text = await response.text();
                console.log('GAS response:', text);
                return JSON.parse(text);
            } catch (error) {
                console.error('POST with response error:', error);
                // CORSエラーの場合でもリクエストは送信されている可能性がある
                throw error;
            }
        }

        // 重複チェック関数
        function checkDuplicate(type, value) {
            if (!value) return null;
            
            for (const video of videos) {
                if (type === 'url') {
                    // URLで判定（YouTube/Vimeo/外部リンク）
                    if (video.videoUrl && video.videoUrl === value) {
                        return video;
                    }
                    // YouTube: 同じ動画IDかチェック
                    const newYoutubeId = extractYoutubeId(value);
                    const existingYoutubeId = extractYoutubeId(video.videoUrl || '');
                    if (newYoutubeId && existingYoutubeId && newYoutubeId === existingYoutubeId) {
                        return video;
                    }
                } else if (type === 'filename') {
                    // ファイル名で判定（Dropbox動画）
                    // videoUrlからファイル名を抽出して比較
                    if (video.source === 'dropbox' && video.videoUrl) {
                        const existingFilename = decodeURIComponent(video.videoUrl.split('/').pop().split('?')[0]);
                        if (existingFilename === value) {
                            return video;
                        }
                    }
                }
            }
            return null;
        }

        // 動画送信
        async function submitVideo() {
            hideError();
            
            const title = document.getElementById('video-title').value.trim();
            const features = document.getElementById('video-features').value.trim();
            const category = document.getElementById('video-category').value;
            
            if (!title) { showError('タイトルを入力してください'); return; }
            if (!features) { showError('特徴・メモを入力してください'); return; }
            if (!category) { showError('カテゴリを選択してください'); return; }

            let videoUrl = '';
            let thumbnail = '';
            let source = '';
            
            // 重複チェック（URL/リンクはブロック、ファイルは警告表示済みなので続行可能）
            if (currentUploadType === 'url') {
                const inputUrl = document.getElementById('video-url').value.trim();
                const duplicate = checkDuplicate('url', inputUrl);
                if (duplicate) {
                    showError(`この動画は既に追加されています：「${duplicate.title}」`);
                    return;
                }
            } else if (currentUploadType === 'link') {
                const inputUrl = document.getElementById('external-link-url').value.trim();
                const duplicate = checkDuplicate('url', inputUrl);
                if (duplicate) {
                    showError(`このリンクは既に追加されています：「${duplicate.title}」`);
                    return;
                }
            }
            // ファイルの重複は警告表示済みで、ユーザーが続行を選択可能

            if (currentUploadType === 'url') {
                // YouTube / Vimeo
                const inputUrl = document.getElementById('video-url').value.trim();
                if (!inputUrl) { showError('動画URLを入力してください'); return; }
                
                if (!detectedPlatform) { showError('有効なYouTube/VimeoのURLを入力してください'); return; }
                
                videoUrl = detectedPlatform.embedUrl;
                thumbnail = detectedPlatform.thumbnail || '';
                source = detectedPlatform.type;
            } else if (currentUploadType === 'dropbox') {
                // 動画ファイル
                if (!selectedFile) { showError('動画ファイルを選択してください'); return; }
                source = 'dropbox';
                // 手動入力のサムネイルURL、なければ自動生成したサムネイルを使用
                thumbnail = document.getElementById('thumbnail-url').value.trim() || generatedThumbnail || '';
            } else if (currentUploadType === 'link') {
                // 外部リンク
                const inputUrl = document.getElementById('external-link-url').value.trim();
                if (!inputUrl) { showError('リンクURLを入力してください'); return; }
                
                videoUrl = inputUrl;
                thumbnail = document.getElementById('link-thumbnail-url').value.trim() || '';
                source = 'external';
            }

            const submitBtn = document.getElementById('submit-btn');
            const progress = document.getElementById('upload-progress');
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');
            
            submitBtn.disabled = true;
            progress.classList.add('active');

            try {
                if (currentUploadType === 'dropbox') {
                    progressText.textContent = 'ファイルを準備中...';
                    progressFill.style.width = '10%';
                    
                    console.log('Dropbox upload started, file:', selectedFile.name, 'size:', selectedFile.size);
                    
                    // ファイルサイズチェック（50MB制限）
                    if (selectedFile.size > 50 * 1024 * 1024) {
                        throw new Error('ファイルサイズが大きすぎます（最大50MB）');
                    }
                    
                    const fileBase64 = await fileToBase64(selectedFile);
                    console.log('Base64 encoded, length:', fileBase64.length);
                    
                    progressText.textContent = 'Dropboxにアップロード中...（大きなファイルは時間がかかります）';
                    progressFill.style.width = '30%';
                    
                    // サムネイルがBase64の場合はそのまま送信
                    const thumbnailToSend = thumbnail.startsWith('data:') ? thumbnail : '';
                    
                    const payload = {
                        action: 'uploadAndSave',
                        fileBase64: fileBase64,
                        fileName: selectedFile.name,
                        mimeType: selectedFile.type,
                        title,
                        description: features,
                        category,
                        thumbnail: thumbnailToSend
                    };
                    
                    console.log('Sending to GAS, payload size:', JSON.stringify(payload).length);
                    
                    // Dropboxアップロード（no-corsモードで送信、レスポンスは取得できない）
                    await postToGas(payload);
                    
                    console.log('POST sent, waiting for GAS processing...');
                    
                    // GAS処理に時間がかかるため、少し待ってから完了扱い
                    progressText.textContent = 'サーバーで処理中...';
                    progressFill.style.width = '70%';
                    
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    progressFill.style.width = '100%';
                    progressText.textContent = '完了！';
                    
                    console.log('Upload process completed');
                    
                    setTimeout(() => {
                        document.getElementById('upload-form').style.display = 'none';
                        document.getElementById('success-message').classList.add('active');
                        generatedThumbnail = null; // リセット
                        loadVideos(true); // キャッシュをクリアして再読み込み
                    }, 500);
                    return;
                }

                progressText.textContent = 'データを保存中...';
                progressFill.style.width = '90%';

                const saveResult = await postToGas({
                    action: 'saveVideo',
                    title,
                    description: features,
                    category,
                    thumbnail,
                    videoUrl,
                    source
                });
                
                if (!saveResult.success) {
                    throw new Error(saveResult.error || 'データの保存に失敗しました');
                }

                progressFill.style.width = '100%';
                progressText.textContent = '完了！';

                setTimeout(() => {
                    document.getElementById('upload-form').style.display = 'none';
                    document.getElementById('success-message').classList.add('active');
                    loadVideos();
                }, 500);

            } catch (error) {
                console.error('Upload error:', error);
                showError(error.message || 'アップロードに失敗しました');
                submitBtn.disabled = false;
                progress.classList.remove('active');
            }
        }

        function resetUploadForm() {
            document.getElementById('upload-form').style.display = 'block';
            document.getElementById('success-message').classList.remove('active');
            document.getElementById('upload-progress').classList.remove('active');
            document.getElementById('progress-fill').style.width = '0%';
            document.getElementById('submit-btn').disabled = false;
            
            document.getElementById('video-url').value = '';
            document.getElementById('video-title').value = '';
            document.getElementById('video-title').placeholder = 'タイトルを入力';
            document.getElementById('video-features').value = '';
            document.getElementById('video-category').value = '';
            document.getElementById('thumbnail-url').value = '';
            document.getElementById('url-thumbnail-preview').classList.remove('active');
            document.getElementById('url-thumbnail-img').src = '';
            document.getElementById('platform-badge').style.display = 'none';
            detectedPlatform = null;
            generatedThumbnail = null;
            
            // 外部リンク入力をリセット
            document.getElementById('external-link-url').value = '';
            document.getElementById('link-thumbnail-url').value = '';
            document.getElementById('link-thumbnail-preview').classList.remove('active');
            document.getElementById('link-thumbnail-img').src = '';
            
            // 重複警告をリセット
            document.getElementById('url-duplicate-warning').classList.remove('active');
            document.getElementById('file-duplicate-warning').classList.remove('active');
            document.getElementById('link-duplicate-warning').classList.remove('active');
            
            const preview = document.getElementById('thumbnail-preview');
            if (preview) {
                preview.style.display = 'none';
                preview.innerHTML = '<p style="font-size:12px;color:#888;margin-bottom:4px;">自動生成されたサムネイル:</p>';
            }
            
            removeFile();
            hideError();
            selectUploadType('url');
        }

        function showError(message) {
            const errorEl = document.getElementById('error-message');
            document.getElementById('error-text').textContent = message;
            errorEl.classList.add('active');
        }

        function hideError() {
            document.getElementById('error-message').classList.remove('active');
        }

        // カテゴリ追加モーダル
        function showAddCategoryModal() {
            document.getElementById('new-category-name').value = '';
            document.getElementById('category-modal').classList.add('active');
        }

        function closeCategoryModal() {
            document.getElementById('category-modal').classList.remove('active');
        }

        async function addCategory() {
            const nameInput = document.getElementById('new-category-name');
            const name = nameInput.value.trim();
            
            if (!name) {
                alert('カテゴリ名を入力してください');
                return;
            }
            
            showLoading('カテゴリを作成中...');
            
            try {
                const result = await postToGas({
                    action: 'addCategory',
                    name: name
                });
                
                hideLoading();
                
                if (result.success) {
                    categories.push(name);
                    updateCategorySelect();
                    updateCategoryFilters();
                    document.getElementById('video-category').value = name;
                    closeCategoryModal();
                } else {
                    alert(result.error || 'カテゴリの追加に失敗しました');
                }
            } catch (error) {
                hideLoading();
                console.error('Add category error:', error);
                alert('カテゴリの追加に失敗しました');
            }
        }

        // 現在モーダルで表示中の動画インデックスとID
        let currentModalVideoIndex = null;
        let currentModalVideoId = null;

        // Dropbox URLを再生可能な形式に変換
        function getPlayableUrl(url, source) {
            if (!url) return url;
            if (source === 'dropbox' || url.includes('dropbox.com')) {
                // 新旧両方のDropbox URL形式に対応（&dl=0 と ?dl=0）
                return url.replace('&dl=0', '&raw=1').replace('?dl=0', '?raw=1');
            }
            return url;
        }

        // モーダル
        function openModal(index) {
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            if (!video) return;

            currentModalVideoIndex = index;
            currentModalVideoId = video.id;

            const container = document.getElementById('modal-video-container');
            const source = video.source || (video.videoUrl?.includes('youtube') ? 'youtube' : 'dropbox');
            const playableUrl = getPlayableUrl(video.videoUrl, source);
            
            // ダウンロードボタンの状態を更新
            const downloadBtn = document.querySelector('.modal-action-btn.download-btn');
            const canDownload = source === 'dropbox';
            if (downloadBtn) {
                downloadBtn.disabled = !canDownload;
                downloadBtn.classList.toggle('disabled', !canDownload);
                downloadBtn.title = canDownload ? 'ダウンロード' : 'この動画はダウンロードできません';
            }
            
            if ((source === 'youtube' || source === 'vimeo') && video.videoUrl) {
                container.innerHTML = `<iframe src="${video.videoUrl}" frameborder="0" allowfullscreen></iframe>`;
            } else if (source === 'instagram' && video.videoUrl) {
                container.innerHTML = `<iframe src="${video.videoUrl}" frameborder="0" scrolling="no"></iframe>`;
            } else if (playableUrl) {
                container.innerHTML = `<video src="${playableUrl}" controls></video>`;
            } else {
                const thumb = video.thumbnail || 'https://via.placeholder.com/640x360/1a1a1a/333?text=No+Video';
                container.innerHTML = `<img src="${thumb}" alt="${video.title}">`;
            }

            const sourceLabels = { youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram', dropbox: 'Dropbox' };
            document.getElementById('modal-title').textContent = video.title || 'Untitled';
            document.getElementById('modal-category').textContent = video.category || 'Uncategorized';
            document.getElementById('modal-date').textContent = video.date || '';
            document.getElementById('modal-source').textContent = sourceLabels[source] || source;
            document.getElementById('modal-description').textContent = video.description || '';

            // ブックマークボタンの状態を更新
            const bookmarkBtn = document.getElementById('modal-bookmark-btn');
            const videoId = video.id !== undefined ? video.id : index;
            if (isBookmarked(videoId)) {
                bookmarkBtn.classList.add('active');
                bookmarkBtn.querySelector('span').textContent = 'ブックマーク済み';
            } else {
                bookmarkBtn.classList.remove('active');
                bookmarkBtn.querySelector('span').textContent = 'ブックマーク';
            }

            document.getElementById('modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // カードクリックのハンドラー
        function handleCardClick(index, event) {
            if (isSelectMode) {
                toggleVideoSelection(index, event);
                return;
            }
            
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            
            // 外部リンクの場合は新しいタブで開く
            if (video && isExternalLink(video)) {
                window.open(video.videoUrl, '_blank');
                return;
            }
            
            openModal(index);
        }

        // 選択モードでの動画選択トグル
        function toggleVideoSelection(index, event) {
            event.stopPropagation();
            
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[index];
            const videoId = video.id !== undefined ? video.id : index;
            const card = event.currentTarget;
            
            if (selectedVideos.has(videoId)) {
                selectedVideos.delete(videoId);
                card.classList.remove('selected');
            } else {
                selectedVideos.add(videoId);
                card.classList.add('selected');
            }
            
            updateSelectionCount();
        }

        function closeModal() {
            document.getElementById('modal').classList.remove('active');
            document.body.style.overflow = '';
            document.getElementById('modal-video-container').innerHTML = '';
            currentModalVideoIndex = null;
        }

        // モーダル内からブックマーク
        function toggleBookmarkFromModal() {
            if (currentModalVideoIndex === null) return;
            const filteredVideos = getFilteredVideos();
            const video = filteredVideos[currentModalVideoIndex];
            if (!video) return;
            
            closeModal();
            openBookmarkModal(video, currentModalVideoIndex);
        }

        // モーダル内から編集
        function openEditFromModal() {
            if (currentModalVideoId === null) return;
            const video = videos.find(v => v.id === currentModalVideoId);
            if (!video) return;
            
            closeModal();
            
            editingVideo = video;
            
            // フォームに現在の値をセット
            document.getElementById('edit-video-title').textContent = video.title || 'Untitled';
            document.getElementById('edit-title-input').value = video.title || '';
            document.getElementById('edit-features-input').value = video.description || '';
            
            // カテゴリ選択肢を更新
            const categorySelect = document.getElementById('edit-category-select');
            categorySelect.innerHTML = categories.map(cat => 
                `<option value="${cat}" ${video.category === cat ? 'selected' : ''}>${cat}</option>`
            ).join('');
            
            document.getElementById('edit-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // モーダル内からダウンロード
        async function downloadFromModal() {
            if (currentModalVideoId === null) return;
            const video = videos.find(v => v.id === currentModalVideoId);
            if (!video) return;
            
            const source = video.source || 'unknown';
            if (source !== 'dropbox') {
                alert('この動画はダウンロードできません');
                return;
            }
            
            if (!video.videoUrl) {
                alert('動画URLが見つかりません');
                return;
            }
            
            showLoading('ダウンロード準備中...');
            
            try {
                const filename = (video.title || 'video') + '.mp4';
                const url = `${CONFIG.GAS_URL}?action=downloadFile&url=${encodeURIComponent(video.videoUrl)}&filename=${encodeURIComponent(filename)}`;
                
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                // Base64データをBlobに変換
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: result.contentType });
                
                // ダウンロードリンクを作成
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = result.filename || filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
                
                hideLoading();
            } catch (error) {
                hideLoading();
                console.error('Download error:', error);
                alert('ダウンロードに失敗しました: ' + error.message);
            }
        }

        // モーダル内から削除
        async function deleteFromModal() {
            if (currentModalVideoId === null) return;
            const video = videos.find(v => v.id === currentModalVideoId);
            if (!video) return;
            
            const confirmed = await showConfirmModal(`「${video.title}」をゴミ箱に移動しますか？`, 'ゴミ箱に移動', '移動');
            if (!confirmed) {
                return;
            }
            
            closeModal();
            showLoading('ゴミ箱に移動中...');
            
            try {
                // スプレッドシートから削除
                await postToGas({
                    action: 'deleteVideo',
                    id: video.id,
                    category: video.category
                });
                
                hideLoading();
                
                // ゴミ箱に追加
                moveToTrash(video);
                
                videos = videos.filter(v => v.id !== video.id);
                renderGallery();
                updateBookmarkCount();
                updateStatus('', 'ゴミ箱に移動しました');
            } catch (error) {
                hideLoading();
                console.error('Delete error:', error);
                
                // エラーが出ても、ゴミ箱に移動
                moveToTrash(video);
                videos = videos.filter(v => v.id !== video.id);
                renderGallery();
                updateBookmarkCount();
                updateStatus('', 'ゴミ箱に移動しました');
            }
        }

        // ブックマーク一覧モーダル
        function openBookmarksModal() {
            document.getElementById('bookmarks-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
            currentBookmarkFilter = 'All';
            bookmarkSearchQuery = '';
            document.getElementById('bookmarks-search-input').value = '';
            renderBookmarksCategoryButtons();
            renderBookmarksGrid();
        }

        function closeBookmarksModal() {
            document.getElementById('bookmarks-modal').classList.remove('active');
            document.body.style.overflow = '';
        }

        function renderBookmarksCategoryButtons() {
            const container = document.getElementById('bookmarks-categories');
            
            // ブックマークカテゴリ別のカウントを計算
            const bookmarkedIds = getBookmarkedIds();
            const categoryCounts = { All: bookmarkedIds.length };
            
            bookmarkedIds.forEach(id => {
                const data = bookmarkData[id];
                const cats = data?.bookmarkCategories || ['お気に入り'];
                cats.forEach(cat => {
                    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                });
            });
            
            const cats = ['All', ...bookmarkCategoryList];
            
            let html = cats.map(cat => {
                const count = categoryCounts[cat] || 0;
                const isAll = cat === 'All';
                return `
                    <div class="bookmark-cat-wrapper ${currentBookmarkFilter === cat ? 'active' : ''}">
                        <button class="bookmark-cat-btn ${currentBookmarkFilter === cat ? 'active' : ''}" 
                                onclick="filterBookmarksCategory('${cat}')">
                            ${cat}
                            <span class="cat-count">(${count})</span>
                        </button>
                        ${!isAll ? `
                            <button class="bookmark-cat-edit-btn" onclick="openEditBookmarkCategoryModal('${cat}')" title="編集">
                                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');
            
            html += `
                <button class="add-bookmark-cat-btn" onclick="showAddBookmarkCategoryFromModal()">
                    <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    追加
                </button>
            `;
            
            container.innerHTML = html;
        }

        function filterBookmarksCategory(category) {
            currentBookmarkFilter = category;
            renderBookmarksCategoryButtons();
            renderBookmarksGrid();
        }

        function filterBookmarksModal() {
            bookmarkSearchQuery = document.getElementById('bookmarks-search-input').value.trim().toLowerCase();
            renderBookmarksGrid();
        }

        function getFilteredBookmarks() {
            let bookmarkedVideos = videos.filter((v, idx) => {
                const vid = v.id !== undefined ? v.id : idx;
                return isBookmarked(vid);
            });
            
            // カテゴリフィルター
            if (currentBookmarkFilter !== 'All') {
                bookmarkedVideos = bookmarkedVideos.filter((v, idx) => {
                    const vid = v.id !== undefined ? v.id : idx;
                    const data = bookmarkData[vid];
                    const cats = data?.bookmarkCategories || ['お気に入り'];
                    return cats.includes(currentBookmarkFilter);
                });
            }
            
            // 検索フィルター
            if (bookmarkSearchQuery) {
                bookmarkedVideos = bookmarkedVideos.filter(v => 
                    (v.title && v.title.toLowerCase().includes(bookmarkSearchQuery)) ||
                    (v.description && v.description.toLowerCase().includes(bookmarkSearchQuery))
                );
            }
            
            return bookmarkedVideos;
        }

        function renderBookmarksGrid() {
            const grid = document.getElementById('bookmarks-grid');
            const filteredBookmarks = getFilteredBookmarks();
            
            if (filteredBookmarks.length === 0) {
                let message = 'ブックマークがありません';
                if (bookmarkSearchQuery) {
                    message = `「${bookmarkSearchQuery}」に一致する動画がありません`;
                } else if (currentBookmarkFilter !== 'All') {
                    message = `「${currentBookmarkFilter}」カテゴリにブックマークがありません`;
                }
                
                grid.innerHTML = `
                    <div class="bookmarks-empty">
                        <svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                        <p>${message}</p>
                    </div>
                `;
                return;
            }
            
            grid.innerHTML = filteredBookmarks.map((video, index) => {
                const thumbnail = video.thumbnail || getDefaultThumbnail(video);
                const videoId = video.id !== undefined ? video.id : videos.indexOf(video);
                const bookmarkCats = bookmarkData[videoId]?.bookmarkCategories || ['お気に入り'];
                const catDisplay = bookmarkCats.length > 1 ? `${bookmarkCats[0]} +${bookmarkCats.length - 1}` : bookmarkCats[0];
                
                return `
                    <div class="bookmark-card" onclick="playBookmarkVideo(${videoId})">
                        <div class="bookmark-card-thumb">
                            <img src="${thumbnail}" alt="${video.title}" 
                                onerror="this.src='https://via.placeholder.com/320x180/1a1a1a/333?text=No+Thumbnail'">
                            <span class="bookmark-card-cat" title="${bookmarkCats.join(', ')}">${catDisplay}</span>
                        </div>
                        <div class="bookmark-card-info">
                            <h4 class="bookmark-card-title">${video.title || 'Untitled'}</h4>
                            <div class="bookmark-card-actions">
                                <button onclick="editBookmarkFromModal(${videoId}, event)" title="カテゴリ編集">
                                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                                </button>
                                <button class="remove" onclick="removeFromBookmarks(${videoId}, event)" title="ブックマーク解除">
                                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function playBookmarkVideo(videoId) {
            const video = videos.find((v, idx) => (v.id !== undefined ? v.id : idx) === videoId);
            if (!video) return;
            
            const container = document.getElementById('modal-video-container');
            const source = video.source || 'youtube';
            
            if ((source === 'youtube' || source === 'vimeo') && video.videoUrl) {
                container.innerHTML = `<iframe src="${video.videoUrl}" frameborder="0" allowfullscreen></iframe>`;
            } else if (source === 'instagram' && video.videoUrl) {
                container.innerHTML = `<iframe src="${video.videoUrl}" frameborder="0" scrolling="no"></iframe>`;
            } else if (video.videoUrl) {
                container.innerHTML = `<video src="${video.videoUrl}" controls></video>`;
            } else {
                container.innerHTML = `<img src="${video.thumbnail || ''}" alt="${video.title}">`;
            }

            const sourceLabels = { youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram', dropbox: 'Dropbox' };
            document.getElementById('modal-title').textContent = video.title || 'Untitled';
            document.getElementById('modal-category').textContent = video.category || 'Uncategorized';
            document.getElementById('modal-date').textContent = video.date || '';
            document.getElementById('modal-source').textContent = sourceLabels[source] || source;
            document.getElementById('modal-description').textContent = video.description || '';

            closeBookmarksModal();
            document.getElementById('modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        async function removeFromBookmarks(videoId, event) {
            event.stopPropagation();
            
            // 全てのブックマークカテゴリから削除
            const categories = bookmarkData[videoId]?.bookmarkCategories || [];
            
            try {
                for (const category of categories) {
                    await postToGas({
                        action: 'removeBookmark',
                        bookmarkCategory: category,
                        videoId: videoId
                    });
                }
                
                delete bookmarkData[videoId];
                
                updateBookmarkCount();
                renderBookmarksCategoryButtons();
                renderBookmarksGrid();
                renderGallery();
            } catch (error) {
                console.error('ブックマーク削除エラー:', error);
                alert('ブックマークの削除に失敗しました');
            }
        }

        // ブックマークモーダルから編集（複数カテゴリ対応）
        function editBookmarkFromModal(videoId, event) {
            event.stopPropagation();
            
            const video = videos.find((v, idx) => (v.id !== undefined ? v.id : idx) === videoId);
            if (!video) return;
            
            // ブックマーク一覧モーダルを閉じる
            closeBookmarksModal();
            
            // ブックマーク編集モーダルを開く
            openBookmarkModal(video, videoId);
        }

        async function showAddBookmarkCategoryFromModal() {
            // ブックマーク一覧モーダルからの追加 - モーダルを使用
            document.getElementById('add-bookmark-category-modal').classList.add('active');
            document.getElementById('new-bookmark-category-name').value = '';
            document.getElementById('new-bookmark-category-name').focus();
            
            // 追加後にブックマーク一覧を更新するフラグ
            window.addBookmarkCategoryFromModal = true;
        }

        document.getElementById('modal').addEventListener('click', e => {
            if (e.target.id === 'modal') closeModal();
        });

        document.getElementById('upload-modal').addEventListener('click', e => {
            if (e.target.id === 'upload-modal') closeUploadModal();
        });

        document.getElementById('category-modal').addEventListener('click', e => {
            if (e.target.id === 'category-modal') closeCategoryModal();
        });

        document.getElementById('bookmarks-modal').addEventListener('click', e => {
            if (e.target.id === 'bookmarks-modal') closeBookmarksModal();
        });

        document.getElementById('bookmark-modal').addEventListener('click', e => {
            if (e.target.id === 'bookmark-modal') closeBookmarkModal();
        });

        document.getElementById('edit-modal').addEventListener('click', e => {
            if (e.target.id === 'edit-modal') closeEditModal();
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (isSelectMode) {
                    exitSelectMode();
                } else {
                    closeModal();
                    closeUploadModal();
                    closeCategoryModal();
                    closeBookmarksModal();
                    closeBookmarkModal();
                    closeAddBookmarkCategoryModal();
                    closeEditModal();
                    closeTrashModal();
                }
            }
        });

        // ===== 複数選択機能 =====
        let isSelectMode = false;
        let selectedVideos = new Set();

        function toggleSelectMode() {
            if (isSelectMode) {
                exitSelectMode();
            } else {
                enterSelectMode();
            }
        }

        function enterSelectMode() {
            isSelectMode = true;
            selectedVideos.clear();
            document.getElementById('gallery').classList.add('select-mode');
            document.getElementById('select-mode-btn').classList.add('active');
            document.getElementById('selection-toolbar').classList.add('active');
            updateSelectionCount();
        }

        function exitSelectMode() {
            isSelectMode = false;
            selectedVideos.clear();
            document.getElementById('gallery').classList.remove('select-mode');
            document.getElementById('select-mode-btn').classList.remove('active');
            document.getElementById('selection-toolbar').classList.remove('active');
            document.querySelectorAll('.video-card.selected').forEach(card => {
                card.classList.remove('selected');
            });
        }

        function updateSelectionCount() {
            const count = selectedVideos.size;
            document.getElementById('selection-count').textContent = `${count}件選択中`;
        }

        function selectAllVideos() {
            const filteredVideos = getFilteredVideos();
            filteredVideos.forEach((video, index) => {
                const videoId = video.id !== undefined ? video.id : index;
                selectedVideos.add(videoId);
            });
            document.querySelectorAll('.video-card').forEach(card => {
                card.classList.add('selected');
            });
            updateSelectionCount();
        }

        function deselectAllVideos() {
            selectedVideos.clear();
            document.querySelectorAll('.video-card.selected').forEach(card => {
                card.classList.remove('selected');
            });
            updateSelectionCount();
        }

        function bookmarkSelectedVideos() {
            const count = selectedVideos.size;
            if (count === 0) {
                alert('動画を選択してください');
                return;
            }
            
            // 複数選択用ブックマークモーダルを開く
            openBulkBookmarkModal();
        }
        
        function openBulkBookmarkModal() {
            const modal = document.getElementById('bookmark-modal');
            const checkboxContainer = document.getElementById('bookmark-category-checkboxes');
            const count = selectedVideos.size;
            
            // 全てのカテゴリを未選択状態で表示
            checkboxContainer.innerHTML = bookmarkCategoryList.map(cat => `
                <label class="bookmark-checkbox-label">
                    <input type="checkbox" value="${cat}">
                    <span>${cat}</span>
                </label>
            `).join('');
            
            // 複数選択モード用にデータ属性を設定
            modal.dataset.bulkMode = 'true';
            modal.dataset.videoId = '';
            document.getElementById('bookmark-video-title').textContent = `${count}件の動画を選択中`;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        async function saveBulkBookmark() {
            const checkboxes = document.querySelectorAll('#bookmark-category-checkboxes input[type="checkbox"]:checked');
            const selectedCategories = Array.from(checkboxes).map(cb => cb.value);
            
            if (selectedCategories.length === 0) {
                alert('カテゴリを選択してください');
                return;
            }
            
            const count = selectedVideos.size;
            showLoading(`${count}件の動画をブックマーク中...`);
            
            try {
                for (const videoId of selectedVideos) {
                    const video = videos.find(v => (v.id !== undefined ? v.id : videos.indexOf(v)) === videoId);
                    if (!video) continue;
                    
                    for (const bookmarkCategory of selectedCategories) {
                        const isAlreadyBookmarked = bookmarkData[videoId]?.bookmarkCategories?.includes(bookmarkCategory);
                        if (!isAlreadyBookmarked) {
                            await postToGas({
                                action: 'addBookmark',
                                bookmarkCategory: bookmarkCategory,
                                video: {
                                    id: video.id,
                                    title: video.title,
                                    description: video.description,
                                    date: video.date,
                                    thumbnail: video.thumbnail,
                                    videoUrl: video.videoUrl,
                                    source: video.source,
                                    category: video.category
                                }
                            });
                            
                            if (!bookmarkData[videoId]) {
                                bookmarkData[videoId] = { category: video.category || 'Uncategorized', bookmarkCategories: [bookmarkCategory], videoData: video };
                            } else if (!bookmarkData[videoId].bookmarkCategories) {
                                bookmarkData[videoId].bookmarkCategories = [bookmarkCategory];
                            } else if (!bookmarkData[videoId].bookmarkCategories.includes(bookmarkCategory)) {
                                bookmarkData[videoId].bookmarkCategories.push(bookmarkCategory);
                            }
                        }
                    }
                }
                
                hideLoading();
                closeBookmarkModal();
                exitSelectMode();
                renderGallery();
                updateBookmarkCount();
                updateStatus('', `${count}件の動画をブックマークしました`);
            } catch (error) {
                hideLoading();
                console.error('Bulk bookmark error:', error);
                alert('ブックマークに失敗しました');
            }
        }

        // ===== ゴミ箱機能 =====
        let trashData = [];

        // ゴミ箱データをローカルストレージから読み込み
        function loadTrashData() {
            try {
                trashData = JSON.parse(localStorage.getItem('videoTrashData') || '[]');
            } catch (e) {
                trashData = [];
            }
            updateTrashBadge();
        }

        // ゴミ箱データを保存
        function saveTrashData() {
            localStorage.setItem('videoTrashData', JSON.stringify(trashData));
            updateTrashBadge();
        }

        // ゴミ箱バッジを更新
        function updateTrashBadge() {
            const badge = document.getElementById('trash-badge');
            badge.textContent = trashData.length > 0 ? trashData.length : '';
        }

        // 動画をゴミ箱に移動
        function moveToTrash(video) {
            const trashItem = {
                ...video,
                deletedAt: new Date().toISOString()
            };
            trashData.push(trashItem);
            saveTrashData();
        }

        // ゴミ箱モーダルを開く
        function openTrashModal() {
            document.getElementById('trash-modal').classList.add('active');
            document.body.style.overflow = 'hidden';
            renderTrashGrid();
        }

        // ゴミ箱モーダルを閉じる
        function closeTrashModal() {
            document.getElementById('trash-modal').classList.remove('active');
            document.body.style.overflow = '';
        }

        // ゴミ箱グリッドを描画
        function renderTrashGrid() {
            const grid = document.getElementById('trash-grid');
            
            if (trashData.length === 0) {
                grid.innerHTML = `
                    <div class="trash-empty-state" style="grid-column: 1/-1;">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        <p>ゴミ箱は空です</p>
                    </div>
                `;
                return;
            }
            
            grid.innerHTML = trashData.map((video, index) => {
                const thumbnail = video.thumbnail || getDefaultThumbnail(video) || 'https://via.placeholder.com/320x180/1a1a1a/333?text=No+Thumbnail';
                const deletedDate = new Date(video.deletedAt).toLocaleDateString('ja-JP');
                
                return `
                    <div class="trash-item">
                        <img class="trash-item-thumbnail" src="${thumbnail}" alt="${video.title}" 
                            onerror="this.src='https://via.placeholder.com/320x180/1a1a1a/333?text=No+Thumbnail'">
                        <div class="trash-item-info">
                            <div class="trash-item-title">${video.title || 'Untitled'}</div>
                            <div class="trash-item-date">削除日: ${deletedDate}</div>
                            <div class="trash-item-actions">
                                <button class="restore-btn" onclick="restoreFromTrash(${index})">
                                    <svg viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z"/></svg>
                                    戻す
                                </button>
                                <button class="permanent-delete-btn" onclick="permanentDelete(${index})">
                                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                    完全削除
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ゴミ箱から復元
        async function restoreFromTrash(index) {
            const video = trashData[index];
            if (!video) return;
            
            showLoading('復元中...');
            
            try {
                // スプレッドシートに再追加
                await postToGas({
                    action: 'saveVideo',
                    id: video.id,
                    title: video.title,
                    description: video.description || '',
                    category: video.category,
                    thumbnail: video.thumbnail || '',
                    videoUrl: video.videoUrl,
                    source: video.source
                });
                
                // ゴミ箱から削除
                trashData.splice(index, 1);
                saveTrashData();
                
                // ローカルデータに追加
                videos.push(video);
                
                hideLoading();
                renderTrashGrid();
                renderGallery();
                updateStatus('', '動画を復元しました');
            } catch (error) {
                hideLoading();
                console.error('Restore error:', error);
                alert('復元に失敗しました');
            }
        }

        // 完全削除
        async function permanentDelete(index) {
            const video = trashData[index];
            if (!video) return;
            
            const confirmed = await showConfirmModal(`「${video.title}」を完全に削除しますか？\n\n※この操作は取り消せません。`, '完全に削除', '削除');
            if (!confirmed) {
                return;
            }
            
            // ゴミ箱から削除
            trashData.splice(index, 1);
            saveTrashData();
            renderTrashGrid();
            updateStatus('', '完全に削除しました');
        }

        // ゴミ箱を空にする
        async function emptyTrash() {
            if (trashData.length === 0) {
                alert('ゴミ箱は空です');
                return;
            }
            
            const confirmed = await showConfirmModal(`ゴミ箱内の${trashData.length}件の動画を完全に削除しますか？\n\n※この操作は取り消せません。`, '完全に削除', '削除');
            if (!confirmed) {
                return;
            }
            
            trashData = [];
            saveTrashData();
            renderTrashGrid();
            updateStatus('', 'ゴミ箱を空にしました');
        }

        // 全て復元
        async function restoreAllFromTrash() {
            if (trashData.length === 0) {
                alert('ゴミ箱は空です');
                return;
            }
            
            const confirmed = await showConfirmModal(`ゴミ箱内の${trashData.length}件の動画を全て復元しますか？`, '全て復元', '復元');
            if (!confirmed) {
                return;
            }
            
            showLoading('復元中...');
            
            for (const video of trashData) {
                try {
                    await postToGas({
                        action: 'saveVideo',
                        id: video.id,
                        title: video.title,
                        description: video.description || '',
                        category: video.category,
                        thumbnail: video.thumbnail || '',
                        videoUrl: video.videoUrl,
                        source: video.source
                    });
                    videos.push(video);
                } catch (error) {
                    console.error('Restore error:', error);
                }
            }
            
            trashData = [];
            saveTrashData();
            
            hideLoading();
            renderTrashGrid();
            renderGallery();
            updateStatus('', '全ての動画を復元しました');
        }

        // 初期化時にゴミ箱データを読み込み
        loadTrashData();
