const CONFIG = {
  API_BASE: 'https://itunes.apple.com',
  STORAGE_KEY: 'musica_library_v4',
  PLAYLISTS_KEY: 'musica_playlists_v4',
  DEBOUNCE_DELAY: 500,
  DEFAULT_LIMIT: 12,
  CHART_LIMIT: 8,
  ALL_CHARTS_LIMIT: 50,
  ALL_RELEASES_LIMIT: 30
};

// utilities
const Utils = {
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },
  
  escapeHtml(text) {
    if(!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  getEmptyState(title, subtitle) {
      return `<div class="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
            <h3>${title}</h3><p>${subtitle}</p>
        </div>`;
  }
};

// state manager
const state = {
  currentTrack: null,
  currentTrackIndex: 0,
  tracks: [], 
  albums: [],
  isPlaying: false,
  volume: 0.7,
  isMuted: false,
  previousVolume: 0.7,
  currentView: 'home',
  searchTimeout: null,
  shuffleMode: false,
  repeatMode: 'off',
  shuffledIndices: [],
  originalIndex: 0,
  library: {
    likedSongs: new Map(),
    likedAlbums: new Map()
  },
  playlists: [],
  currentPlaylistId: null,
  currentAlbumId: null,
  contextMenuTarget: null,
  contextMenuType: null 
};

// storage
const Storage = {
  load() {
    try {
      const libData = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (libData) {
        const parsed = JSON.parse(libData);
        state.library.likedSongs = new Map(parsed.likedSongs);
        state.library.likedAlbums = new Map(parsed.likedAlbums);
      }
      
      const playlistsData = localStorage.getItem(CONFIG.PLAYLISTS_KEY);
      if (playlistsData) {
        state.playlists = JSON.parse(playlistsData);
      }
    } catch (error) {
      console.error('Storage Load Error:', error);
      state.library.likedSongs = new Map();
      state.library.likedAlbums = new Map();
    }
  },
  
  save() {
    try {
      const data = {
        likedSongs: Array.from(state.library.likedSongs.entries()),
        likedAlbums: Array.from(state.library.likedAlbums.entries())
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save library:', error);
    }
  },
  
  savePlaylists() {
    try {
      localStorage.setItem(CONFIG.PLAYLISTS_KEY, JSON.stringify(state.playlists));
    } catch (error) {
      console.error('Failed to save playlists:', error);
    }
  }
};

// api
const API = {
  async fetch(endpoint) {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/${endpoint}`);
      if (!response.ok) throw new Error('API request failed');
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
  
  async search(term, entity = 'song', limit = CONFIG.DEFAULT_LIMIT) {
    const query = `search?term=${encodeURIComponent(term)}&entity=${entity}&limit=${limit}`;
    return this.fetch(query);
  },
  
  async lookup(id) {
    return this.fetch(`lookup?id=${id}&entity=song`);
  }
};

// notification system
const Toast = {
  show(message, type = 'default') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconPath = '';
    if (type === 'success') {
        iconPath = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
    } else if (type === 'error') {
        iconPath = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
    } else if (type === 'removed') {
        iconPath = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
    } else {
        iconPath = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>';
    }

    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">${iconPath}</svg>
      <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

// audio control
const AudioController = {
  audio: document.getElementById('audioPlayer'),
  
  init() {
    this.audio.volume = state.volume;
    this.setupEventListeners();
  },
  
  setupEventListeners() {
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.handleTrackEnd());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    this.audio.addEventListener('error', () => this.handleError());
    this.audio.addEventListener('play', () => {
        state.isPlaying = true;
        this.updateDocumentTitle();
        UI.updatePlayButton();
        UI.updatePlayingStates();
    });
    this.audio.addEventListener('pause', () => {
        state.isPlaying = false;
        this.updateDocumentTitle();
        UI.updatePlayButton();
    });
  },
  
  play(track, index = null) {
    if (!track) return;
    if (!track.previewUrl) {
      Toast.show('Preview unavailable for this track', 'error');
      return;
    }
    
    if (index !== null) {
      state.currentTrackIndex = index;
      state.originalIndex = index;
      if(state.shuffleMode) this.generateShuffledIndices();
    }
    if (state.currentTrack?.trackId === track.trackId && this.audio.src) {
      if(this.audio.paused) {
          this.audio.play().catch(e => console.error(e));
      } else {
      }
      return;
    }

    state.currentTrack = track;
    state.isPlaying = true;
    
    this.audio.src = track.previewUrl;
    this.audio.play().catch(error => {
      console.error('Playback error:', error);
      if(error.name !== 'AbortError') {
          state.isPlaying = false;
          UI.updatePlayButton();
          Toast.show('Unable to play track', 'error');
      }
    });
    
    UI.updatePlayer(track);
    UI.updatePlayButton();
    UI.updatePlayingStates();
    Library.updateLikeButtons();
    this.updateDocumentTitle();
  },
  
  togglePlay() {
    if (!this.audio.src) {
        if(state.tracks.length > 0) this.play(state.tracks[0], 0);
        return;
    }
    
    if (state.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play().catch(e => console.error(e));
    }
  },
  
  toggleShuffle() {
    state.shuffleMode = !state.shuffleMode;
    if (state.shuffleMode) {
      this.generateShuffledIndices();
      Toast.show('Shuffle On', 'success');
    } else {
      state.shuffledIndices = [];
      const currentId = state.currentTrack?.trackId;
      const originalIdx = state.tracks.findIndex(t => t.trackId === currentId);
      state.currentTrackIndex = originalIdx !== -1 ? originalIdx : 0;
      Toast.show('Shuffle Off', 'removed');
    }
    UI.updateShuffleButton();
  },
  
  toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(state.repeatMode);
    state.repeatMode = modes[(currentIndex + 1) % modes.length];
    
    const messages = { 'off': 'Repeat Off', 'all': 'Repeat All', 'one': 'Repeat One' };
    const type = state.repeatMode === 'off' ? 'removed' : 'success';
    Toast.show(messages[state.repeatMode], type);
    UI.updateRepeatButton();
  },

  toggleMute() {
      if(state.isMuted) {
          state.isMuted = false;
          state.volume = state.previousVolume;
          this.audio.volume = state.volume;
      } else {
          state.previousVolume = state.volume;
          state.isMuted = true;
          state.volume = 0;
          this.audio.volume = 0;
      }
      UI.updateVolumeBar();
  },
  
  generateShuffledIndices() {
    let indices = state.tracks.map((_, i) => i);
    const currentPos = state.currentTrackIndex;
    if(currentPos !== -1) indices = indices.filter(i => i !== currentPos);

    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    if(currentPos !== -1) indices.unshift(currentPos);
    state.shuffledIndices = indices;
    state.currentTrackIndex = 0; 
  },
  
  next() {
    let nextIndex;
    if (state.shuffleMode) {
      nextIndex = state.currentTrackIndex + 1;
      if (nextIndex >= state.shuffledIndices.length) {
        if (state.repeatMode === 'all') nextIndex = 0;
        else return;
      }
      state.currentTrackIndex = nextIndex;
      const actualIndex = state.shuffledIndices[nextIndex];
      this.play(state.tracks[actualIndex]); 
    } else {
      nextIndex = state.currentTrackIndex + 1;
      if (nextIndex >= state.tracks.length) {
        if (state.repeatMode === 'all') nextIndex = 0;
        else return;
      }
      this.play(state.tracks[nextIndex], nextIndex);
    }
  },
  
  previous() {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    
    let prevIndex;
    if (state.shuffleMode) {
        prevIndex = state.currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = state.shuffledIndices.length - 1;
        state.currentTrackIndex = prevIndex;
        const actualIndex = state.shuffledIndices[prevIndex];
        this.play(state.tracks[actualIndex]);
    } else {
        prevIndex = state.currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = state.tracks.length - 1;
        this.play(state.tracks[prevIndex], prevIndex);
    }
  },
  
  seek(percent) {
    const time = (percent / 100) * this.audio.duration;
    if (!isNaN(time)) this.audio.currentTime = time;
  },
  
  setVolume(percent) {
    state.volume = Math.max(0, Math.min(1, percent / 100));
    state.isMuted = state.volume === 0;
    if(!state.isMuted) state.previousVolume = state.volume;
    
    this.audio.volume = state.volume;
    UI.updateVolumeBar();
  },
  
  updateProgress() {
    const percent = (this.audio.currentTime / this.audio.duration) * 100;
    UI.updateProgressBar(percent, this.audio.currentTime);
  },
  
  updateDuration() {
    UI.updateTotalTime(this.audio.duration);
  },
  
  handleTrackEnd() {
    if (state.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play();
    } else {
      this.next();
    }
  },
  
  handleError() {
    console.error('Audio playback error');
    state.isPlaying = false;
    UI.updatePlayButton();
  },
  
  updateDocumentTitle() {
    if (state.currentTrack && state.isPlaying) {
      document.title = `♫ ${state.currentTrack.trackName} • ${state.currentTrack.artistName}`;
    } else {
      document.title = 'Musica - Your Music Streaming Platform';
    }
  }
};

// ui render
const UI = {
  elements: {},
  
  init() {
    this.cacheElements();
    this.setupEventListeners();
  },
  
  cacheElements() {
    const ids = [
      'searchInput', 'topCharts', 'newReleases', 'quickPicks',
      'playBtn', 'playIcon', 'playerCover', 'playerTitle', 'playerArtist',
      'progressBar', 'progressFill', 'progressHandle', 'currentTime', 'totalTime',
      'volumeBtn', 'volumeBar', 'volumeFill', 'volumeHandle', 'prevBtn', 'nextBtn', 'shuffleBtn', 'repeatBtn',
      'likeSongBtn', 'likeAlbumBtn', 'contentScroll', 'homeView', 'searchView',
      'libraryView', 'detailView', 'searchResults', 'libraryContent',
      'detailCover', 'detailTitle', 'detailArtist', 'detailMeta',
      'detailTracks', 'playAllBtn', 'chartsView', 'releasesView',
      'allChartsGrid', 'allReleasesGrid', 'playlistsList',
      'playlistModal', 'playlistNameInput', 'closeModalBtn',
      'createPlaylistBtn', 'cancelPlaylistBtn', 'playlistDetailView',
      'playlistDetailTitle', 'playlistDetailMeta', 'playlistDetailTracks',
      'playPlaylistBtn', 'mobilePlayerExpanded', 'collapsePlayerBtn',
      'mobilePlayerCover', 'mobilePlayerTitle', 'mobilePlayerArtist',
      'mobilePlayBtn', 'mobilePlayIcon', 'mobileProgressBar',
      'mobileProgressFill', 'mobileCurrentTime', 'mobileTotalTime',
      'mobileShuffleBtn', 'mobilePrevBtn', 'mobileNextBtn', 'mobileRepeatBtn',
      'mobilePlayerLike', 'playlistCoverColor', 'playlistCoverWrapper',
      'albumContextBtn', 'playlistContextBtn', 'editPlaylistModal',
      'editPlaylistTracks', 'closeEditBtn', 'closeEditModalBtn'
    ];
    
    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  },
  
  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu')) ContextMenu.close();
    });

    const controls = [
        { el: this.elements.playBtn, action: () => AudioController.togglePlay() },
        { el: this.elements.prevBtn, action: () => AudioController.previous() },
        { el: this.elements.nextBtn, action: () => AudioController.next() },
        { el: this.elements.shuffleBtn, action: () => AudioController.toggleShuffle() },
        { el: this.elements.repeatBtn, action: () => AudioController.toggleRepeat() },
        { el: this.elements.volumeBtn, action: () => AudioController.toggleMute() },
        { el: this.elements.mobilePlayBtn, action: () => AudioController.togglePlay() },
        { el: this.elements.mobilePrevBtn, action: () => AudioController.previous() },
        { el: this.elements.mobileNextBtn, action: () => AudioController.next() },
        { el: this.elements.mobileShuffleBtn, action: () => AudioController.toggleShuffle() },
        { el: this.elements.mobileRepeatBtn, action: () => AudioController.toggleRepeat() },
        { el: this.elements.collapsePlayerBtn, action: () => MobilePlayer.collapse() }
    ];
    controls.forEach(c => c.el?.addEventListener('click', c.action));
    
    const playerBar = document.querySelector('.player-bar');
    if(playerBar) {
        playerBar.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && !e.target.closest('button') && !e.target.closest('.volume-bar-container')) {
                MobilePlayer.expand();
            }
        });
    }
    
    const clickSeek = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      AudioController.seek(percent);
      e.stopPropagation();
    };
    this.elements.progressBar?.addEventListener('click', clickSeek);
    this.elements.mobileProgressBar?.addEventListener('click', clickSeek);
    
    this.elements.volumeBar?.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      AudioController.setVolume(percent);
    });
    
    this.elements.searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      clearTimeout(state.searchTimeout);
      if (!query) { Router.navigate('home'); return; }
      state.searchTimeout = setTimeout(() => Search.perform(query), CONFIG.DEBOUNCE_DELAY);
    });
    
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => Router.navigate(btn.dataset.view));
    });
    
    document.querySelectorAll('[data-see-all]').forEach(btn => {
      btn.addEventListener('click', () => Router.navigate(btn.dataset.seeAll));
    });
    
    document.querySelectorAll('[data-lib-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-lib-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Library.renderTab(btn.dataset.libTab);
      });
    });
    
    const toggleLike = () => Library.toggleLikeSong();
    this.elements.likeSongBtn?.addEventListener('click', toggleLike);
    this.elements.mobilePlayerLike?.addEventListener('click', toggleLike);
    this.elements.likeAlbumBtn?.addEventListener('click', () => Library.toggleLikeAlbum());
    
    document.querySelector('.create-playlist-btn')?.addEventListener('click', () => Playlist.openModal());
    this.elements.closeModalBtn?.addEventListener('click', () => Playlist.closeModal());
    this.elements.cancelPlaylistBtn?.addEventListener('click', () => Playlist.closeModal());
    this.elements.createPlaylistBtn?.addEventListener('click', () => Playlist.create());
    
    this.elements.closeEditBtn?.addEventListener('click', () => Playlist.closeEditModal());
    this.elements.closeEditModalBtn?.addEventListener('click', () => Playlist.closeEditModal());

    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    this.elements.albumContextBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const album = {
            collectionId: state.currentAlbumId,
            collectionName: this.elements.detailTitle.textContent,
            artistName: this.elements.detailArtist.textContent,
            artworkUrl100: this.elements.detailCover.src
        };
        album.tracks = state.tracks; 
        ContextMenu.show(e, album, 'album');
    });

    this.elements.playlistContextBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const playlist = state.playlists.find(p => p.id === state.currentPlaylistId);
        if(playlist) ContextMenu.show(e, playlist, 'playlist');
    });

    const mobileMoreBtn = document.querySelector('.mobile-player-header .btn-icon[aria-label="More options"]');
    if(mobileMoreBtn) {
        mobileMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if(state.currentTrack) {
                ContextMenu.show(e, state.currentTrack, 'track');
            }
        });
    }
  },
  
  renderTopCharts(tracks, containerId = 'topCharts') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = tracks.map((track, index) => `
      <div class="track-card ${state.currentTrack?.trackId === track.trackId ? 'playing' : ''}" 
           data-index="${index}" data-track-id="${track.trackId}">
        <img class="track-cover" src="${track.artworkUrl100}" alt="${Utils.escapeHtml(track.trackName)}">
        <div class="track-info">
          <div class="track-title">${Utils.escapeHtml(track.trackName)}</div>
          <div class="track-artist">${Utils.escapeHtml(track.artistName)}</div>
        </div>
        <div class="track-duration">${Utils.formatTime(track.trackTimeMillis / 1000)}</div>
        <button class="track-like btn-icon-small ${state.library.likedSongs.has(track.trackId) ? 'liked' : ''}" 
                data-track-id="${track.trackId}">
          <svg viewBox="0 0 24 24" fill="${state.library.likedSongs.has(track.trackId) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
    `).join('');
    
    container.querySelectorAll('.track-card').forEach((card, index) => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.track-like')) {
          state.tracks = tracks; 
          AudioController.play(tracks[index], index);
        }
      });
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ContextMenu.show(e, tracks[index], 'track');
      });
    });
    
    container.querySelectorAll('.track-like').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = parseInt(btn.dataset.trackId);
        const track = tracks.find(t => t.trackId === trackId);
        Library.toggleLikeSong(track);
        this.updateLikeStateInDOM(trackId);
      });
    });
  },
  
  renderAlbums(albums, containerId = 'newReleases') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = albums.map(album => `
      <div class="album-card" data-album-id="${album.collectionId}">
        <img class="album-cover" src="${album.artworkUrl100.replace('100x100', '400x400')}" alt="${Utils.escapeHtml(album.collectionName)}">
        <div class="album-title">${Utils.escapeHtml(album.collectionName)}</div>
        <div class="album-artist">${Utils.escapeHtml(album.artistName)}</div>
      </div>
    `).join('');
    
    container.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', () => Album.load(card.dataset.albumId));
      card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const id = parseInt(card.dataset.albumId);
          const album = albums.find(a => a.collectionId === id);
          ContextMenu.show(e, album, 'album');
      });
    });
  },
  
  updatePlayer(track) {
    if (!track) return;
    if(this.elements.playerCover) this.elements.playerCover.src = track.artworkUrl100;
    if(this.elements.playerTitle) this.elements.playerTitle.textContent = track.trackName;
    if(this.elements.playerArtist) this.elements.playerArtist.textContent = track.artistName;
    
    if(this.elements.mobilePlayerCover) this.elements.mobilePlayerCover.src = track.artworkUrl100.replace('100x100', '400x400');
    if(this.elements.mobilePlayerTitle) this.elements.mobilePlayerTitle.textContent = track.trackName;
    if(this.elements.mobilePlayerArtist) this.elements.mobilePlayerArtist.textContent = track.artistName;
  },
  
  updatePlayButton() {
    const icons = [this.elements.playIcon, this.elements.mobilePlayIcon];
    const path = state.isPlaying 
        ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
        : '<path d="M8 5v14l11-7z"/>';
        
    icons.forEach(icon => { if(icon) icon.innerHTML = path; });

    const playSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play';
    const pauseSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> Pause';

    if (this.elements.playAllBtn) {
        const isPlayingContext = state.isPlaying && state.currentView === 'detail' && 
                               (state.currentTrack && state.currentAlbumId === state.currentTrack.collectionId);
        this.elements.playAllBtn.innerHTML = isPlayingContext ? pauseSvg : playSvg;
    }
    if (this.elements.playPlaylistBtn) {
        const isPlayingContext = state.isPlaying && state.currentView === 'playlistDetail' &&
                               (state.playlists.find(p => p.id === state.currentPlaylistId)?.tracks.some(t => t.trackId === state.currentTrack?.trackId));
        this.elements.playPlaylistBtn.innerHTML = isPlayingContext ? pauseSvg : playSvg;
    }
  },
  
  updateShuffleButton() {
    [this.elements.shuffleBtn, this.elements.mobileShuffleBtn].forEach(btn => {
        btn?.classList.toggle('shuffle-active', state.shuffleMode);
    });
  },
  
  updateRepeatButton() {
    [this.elements.repeatBtn, this.elements.mobileRepeatBtn].forEach(btn => {
      if (btn) {
        btn.classList.remove('repeat-all', 'repeat-one');
        if (state.repeatMode === 'all') btn.classList.add('repeat-all');
        if (state.repeatMode === 'one') btn.classList.add('repeat-one');
      }
    });
  },
  
  updateProgressBar(percent, currentTime) {
    if (this.elements.progressFill) this.elements.progressFill.style.width = `${percent}%`;
    if (this.elements.progressHandle) this.elements.progressHandle.style.left = `${percent}%`; 
    
    if (this.elements.mobileProgressFill) this.elements.mobileProgressFill.style.width = `${percent}%`;
    if (this.elements.currentTime) this.elements.currentTime.textContent = Utils.formatTime(currentTime);
    if (this.elements.mobileCurrentTime) this.elements.mobileCurrentTime.textContent = Utils.formatTime(currentTime);
  },
  
  updateTotalTime(duration) {
    const t = Utils.formatTime(duration);
    if(this.elements.totalTime) this.elements.totalTime.textContent = t;
    if(this.elements.mobileTotalTime) this.elements.mobileTotalTime.textContent = t;
  },
  
  updateVolumeBar() {
    const percent = state.volume * 100;
    if (this.elements.volumeFill) this.elements.volumeFill.style.width = `${percent}%`;
    if (this.elements.volumeHandle) this.elements.volumeHandle.style.left = `${percent}%`; 
    
    if (this.elements.volumeBtn) {
        if(state.volume === 0) {
            this.elements.volumeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
        } else {
            this.elements.volumeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
        }
    }
  },
  
  updatePlayingStates() {
    document.querySelectorAll('.track-card').forEach(card => {
        const id = parseInt(card.dataset.trackId);
        if (id === state.currentTrack?.trackId) card.classList.add('playing');
        else card.classList.remove('playing');
    });
  },

  updateLikeStateInDOM(trackId) {
    const isLiked = state.library.likedSongs.has(trackId);
    document.querySelectorAll(`.track-like[data-track-id="${trackId}"]`).forEach(btn => {
        btn.classList.toggle('liked', isLiked);
        btn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');
    });
  }
};

// mobile player controls

const MobilePlayer = {
    expand() {
        const el = document.getElementById('mobilePlayerExpanded');
        if(el) el.classList.add('active');
    },
    collapse() {
        const el = document.getElementById('mobilePlayerExpanded');
        if(el) el.classList.remove('active');
    }
};

// router for nav
const Router = {
  navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    const targetView = document.getElementById(`${view}View`);
    if (targetView) {
      targetView.classList.add('active');
      state.currentView = view;
    }
    
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    UI.elements.contentScroll?.scrollTo({ top: 0, behavior: 'smooth' });
    this.loadViewData(view);
    UI.updatePlayButton();
  },
  
  async loadViewData(view) {
    switch(view) {
      case 'library': Library.renderTab('songs'); break;
      case 'charts': await this.loadAllCharts(); break;
      case 'releases': await this.loadAllReleases(); break;
    }
  },
  
  async loadAllCharts() {
    try {
      const data = await API.search('top hits', 'song', CONFIG.ALL_CHARTS_LIMIT);
      const tracks = data.results.filter(t => t.previewUrl);
      UI.renderTopCharts(tracks, 'allChartsGrid');
    } catch (error) { Toast.show('Failed to load charts', 'error'); }
  },
  
  async loadAllReleases() {
    try {
      const data = await API.search('new music', 'album', CONFIG.ALL_RELEASES_LIMIT);
      UI.renderAlbums(data.results, 'allReleasesGrid');
    } catch (error) { Toast.show('Failed to load releases', 'error'); }
  }
};

// context menu handler

const ContextMenu = {
    menu: null,

    init() {
        this.menu = document.createElement('div');
        this.menu.className = 'context-menu';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);
    },

    show(e, item, type) {
        state.contextMenuTarget = item;
        state.contextMenuType = type;
        const x = e.clientX;
        const y = e.clientY;

        let content = '';

        if (type === 'track') {
            const isLiked = state.library.likedSongs.has(item.trackId);
            let playlistOptions = '';
            if(state.playlists.length > 0) {
                playlistOptions = `
                    <div class="context-menu-divider"></div>
                    ${state.playlists.map(pl => 
                        `<div class="context-menu-item" onclick="Playlist.addTrackTo('${pl.id}')">Add to ${pl.name}</div>`
                    ).join('')}
                `;
            }
            content = `
                <div class="context-menu-item" onclick="Library.toggleLikeSong(state.contextMenuTarget); ContextMenu.close()">
                    ${isLiked ? 'Remove from Liked' : 'Save to Liked Songs'}
                </div>
                ${playlistOptions}
            `;
        } 
        else if (type === 'album') {
            const isLiked = state.library.likedAlbums.has(item.collectionId);
            let playlistOptions = '';
            if(state.playlists.length > 0) {
                 playlistOptions = `
                    <div class="context-menu-divider"></div>
                    ${state.playlists.map(pl => 
                        `<div class="context-menu-item" onclick="Playlist.addAllTracksTo('${pl.id}')">Add all to ${pl.name}</div>`
                    ).join('')}
                `;
            }

            content = `
                <div class="context-menu-item" onclick="Library.toggleLikeAlbum(state.contextMenuTarget); ContextMenu.close()">
                    ${isLiked ? 'Remove from Albums' : 'Save to Albums'}
                </div>
                ${playlistOptions}
            `;
        }
        else if (type === 'playlist') {
            content = `
                <div class="context-menu-item" onclick="Playlist.edit('${item.id}')">Edit Playlist</div>
                <div class="context-menu-item" onclick="Playlist.clear('${item.id}'); ContextMenu.close()">Clear Playlist</div>
                <div class="context-menu-divider"></div>
                <div class="context-menu-item" style="color:#e74c3c" onclick="Playlist.delete('${item.id}'); ContextMenu.close()">Delete Playlist</div>
            `;
        }

        content += `<div class="context-menu-divider"></div><div class="context-menu-item" onclick="ContextMenu.close()">Cancel</div>`;
        
        this.menu.innerHTML = content;
        
        this.menu.style.display = 'block';
        const rect = this.menu.getBoundingClientRect();
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;

        let posX = x;
        let posY = y;

        if (posX + rect.width > winWidth) {
            posX = winWidth - rect.width - 8;
        }
        
        if (posY + rect.height > winHeight) {
            const spaceAbove = y;
            if (spaceAbove > rect.height) {
                posY = y - rect.height;
            } else {
                posY = winHeight - rect.height - 8;
            }
        }
        
        if (posY < 8) posY = 8;

        this.menu.style.left = `${posX}px`;
        this.menu.style.top = `${posY}px`;
    },

    close() {
        if(this.menu) this.menu.style.display = 'none';
    }
};

// playlist manager

const Playlist = {
    renderSidebar() {
        const container = document.getElementById('playlistsList');
        if(!container) return;
        
        container.innerHTML = state.playlists.map(pl => `
            <div class="playlist-item" onclick="Playlist.open('${pl.id}')" oncontextmenu="event.preventDefault(); ContextMenu.show(event, {id: '${pl.id}'}, 'playlist')">
                <div class="playlist-item-cover" style="background: ${pl.color}">
                    <svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
                <div class="playlist-item-text">
                    <div class="playlist-item-name">${pl.name}</div>
                    <div class="playlist-item-count">${pl.tracks.length} songs</div>
                </div>
            </div>
        `).join('');
    },

    openModal() { document.getElementById('playlistModal').classList.add('active'); },
    closeModal() {
        document.getElementById('playlistModal').classList.remove('active');
        document.getElementById('playlistNameInput').value = '';
    },

    create() {
        const nameInput = document.getElementById('playlistNameInput');
        const name = nameInput.value.trim();
        if(!name) { Toast.show('Please enter a name', 'error'); return; }

        const activeColorBtn = document.querySelector('.color-btn.active');
        const color = activeColorBtn ? activeColorBtn.dataset.color : '#1db954';

        const newPlaylist = { id: 'pl_' + Date.now(), name: name, color: color, tracks: [] };
        state.playlists.push(newPlaylist);
        Storage.savePlaylists();
        this.renderSidebar();
        this.closeModal();
        Toast.show(`Playlist "${name}" created`, 'success');
        Library.renderTab('playlists');
    },

    addTrackTo(playlistId) {
        const playlist = state.playlists.find(p => p.id === playlistId);
        const track = state.contextMenuTarget;
        if(playlist && track) {
            if(playlist.tracks.some(t => t.trackId === track.trackId)) {
                Toast.show('Song already in playlist', 'error');
            } else {
                playlist.tracks.push(track);
                Storage.savePlaylists();
                this.renderSidebar();
                Toast.show(`Added to ${playlist.name}`, 'success');
            }
        }
        ContextMenu.close();
    },

    addAllTracksTo(playlistId) {
        const playlist = state.playlists.find(p => p.id === playlistId);
        const album = state.contextMenuTarget;
        if(playlist && album && album.tracks && album.tracks.length > 0) {
            let count = 0;
            album.tracks.forEach(track => {
                if(!playlist.tracks.some(t => t.trackId === track.trackId)) {
                    playlist.tracks.push(track);
                    count++;
                }
            });
            
            if (count > 0) {
                Storage.savePlaylists();
                this.renderSidebar();
                Toast.show(`Added ${count} songs to ${playlist.name}`, 'success');
            } else {
                Toast.show('All songs already in playlist');
            }
        } else {
            Toast.show('No tracks to add', 'error');
        }
        ContextMenu.close();
    },
    
    delete(playlistId) {
        state.playlists = state.playlists.filter(p => p.id !== playlistId);
        Storage.savePlaylists();
        this.renderSidebar();
        Library.renderTab('playlists');
        if(state.currentPlaylistId === playlistId && state.currentView === 'playlistDetail') {
            Router.navigate('home');
        }
        Toast.show('Playlist deleted', 'removed');
    },
    
    clear(playlistId) {
        const playlist = state.playlists.find(p => p.id === playlistId);
        if(playlist) {
            playlist.tracks = [];
            Storage.savePlaylists();
            this.renderSidebar();
            if(state.currentView === 'playlistDetail' && state.currentPlaylistId === playlistId) {
                this.open(playlistId);
            }
            Toast.show('Playlist cleared', 'removed');
        }
    },
    
    // edit modal
    edit(playlistId) {
        ContextMenu.close();
        
        const playlist = state.playlists.find(p => p.id === playlistId);
        if(!playlist) return;
        
        state.currentPlaylistId = playlistId;
        const container = document.getElementById('editPlaylistTracks');
        if(!container) return;
        
        window.PlaylistEditHelper = {
            move: (index, direction) => {
                 const pl = state.playlists.find(p => p.id === playlistId);
                 if(!pl) return;
                 const newIndex = index + direction;
                 if (newIndex < 0 || newIndex >= pl.tracks.length) return;
                 
                 [pl.tracks[index], pl.tracks[newIndex]] = [pl.tracks[newIndex], pl.tracks[index]];
                 Storage.savePlaylists();
                 this.renderEditListInternal(playlistId, container);
                 if(state.currentView === 'playlistDetail' && state.currentPlaylistId === playlistId) {
                     this.open(playlistId, true); 
                 }
            },
            remove: (index) => {
                 const pl = state.playlists.find(p => p.id === playlistId);
                 if(!pl) return;
                 pl.tracks.splice(index, 1);
                 Storage.savePlaylists();
                 this.renderEditListInternal(playlistId, container);
                 this.renderSidebar();
                 if(state.currentView === 'playlistDetail' && state.currentPlaylistId === playlistId) {
                     this.open(playlistId, true);
                 }
            }
        };
        
        this.renderEditListInternal(playlistId, container);
        document.getElementById('editPlaylistModal').classList.add('active');
    },
    
    renderEditListInternal(playlistId, container) {
        const playlist = state.playlists.find(p => p.id === playlistId);
        if(!playlist || playlist.tracks.length === 0) {
            container.innerHTML = '<p style="color:#aaa; text-align:center;">No tracks in playlist</p>';
            return;
        }
        container.innerHTML = playlist.tracks.map((track, index) => `
            <div class="edit-track-item">
                <span class="edit-track-name">${index + 1}. ${track.trackName}</span>
                <div class="edit-actions">
                    <button class="btn-icon-small" onclick="window.PlaylistEditHelper.move(${index}, -1)">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
                    </button>
                    <button class="btn-icon-small" onclick="window.PlaylistEditHelper.move(${index}, 1)">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
                    </button>
                    <button class="btn-icon-small" style="color:#e74c3c" onclick="window.PlaylistEditHelper.remove(${index})">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    },
    
    closeEditModal() {
        document.getElementById('editPlaylistModal').classList.remove('active');
        window.PlaylistEditHelper = null; 
    },

    open(playlistId, skipNav = false) {
        const playlist = state.playlists.find(p => p.id === playlistId);
        if(!playlist) return;
        state.currentPlaylistId = playlistId;
        
        const wrapper = document.getElementById('playlistCoverWrapper');
        const colorDiv = document.getElementById('playlistCoverColor');
        const title = document.getElementById('playlistDetailTitle');
        const meta = document.getElementById('playlistDetailMeta');
        
        if(wrapper) wrapper.style.boxShadow = `0 8px 32px ${playlist.color}66`;
        if(colorDiv) {
            colorDiv.style.background = playlist.color;
            colorDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
        }
        if(title) title.textContent = playlist.name;
        if(meta) meta.textContent = `${playlist.tracks.length} songs`;
        
        UI.renderTopCharts(playlist.tracks, 'playlistDetailTracks');
        
        const playBtn = document.getElementById('playPlaylistBtn');
        if(playBtn) playBtn.onclick = () => {
             if(state.isPlaying && state.currentView === 'playlistDetail' && 
                playlist.tracks.some(t => t.trackId === state.currentTrack?.trackId)) {
                 AudioController.togglePlay();
             } else {
                 UI.playAll(playlist.tracks);
             }
        };

        if(!skipNav) Router.navigate('playlistDetail');
    }
};

// lib manager

const Library = {
  toggleLikeSong(track = state.currentTrack) {
    if (!track) return;
    if (state.library.likedSongs.has(track.trackId)) {
      state.library.likedSongs.delete(track.trackId);
      Toast.show('Removed from Liked Songs', 'removed');
    } else {
      state.library.likedSongs.set(track.trackId, track);
      Toast.show('Added to Liked Songs', 'success');
    }
    Storage.save();
    this.updateLikeButtons();
    if(state.currentView === 'library') this.renderTab('songs');
  },
  
  toggleLikeAlbum(album) {
    let targetAlbum = album;
    if(!targetAlbum && state.currentView === 'detail') {
        const id = UI.elements.detailCover?.dataset.albumId;
        if(id) {
            targetAlbum = {
                collectionId: parseInt(id),
                collectionName: UI.elements.detailTitle.textContent,
                artistName: UI.elements.detailArtist.textContent,
                artworkUrl100: UI.elements.detailCover.src
            };
        }
    }
    if (!targetAlbum) return;
    if (state.library.likedAlbums.has(targetAlbum.collectionId)) {
      state.library.likedAlbums.delete(targetAlbum.collectionId);
      Toast.show('Removed from Albums', 'removed');
    } else {
      state.library.likedAlbums.set(targetAlbum.collectionId, targetAlbum);
      Toast.show('Added to Albums', 'success');
    }
    Storage.save();
    this.updateLikeButtons();
    if(state.currentView === 'library') this.renderTab('albums');
  },
  
  updateLikeButtons() {
    if (state.currentTrack) {
      const isLiked = state.library.likedSongs.has(state.currentTrack.trackId);
      [UI.elements.likeSongBtn, UI.elements.mobilePlayerLike].forEach(btn => {
          if(btn) {
              btn.classList.toggle('liked', isLiked);
              btn.querySelector('svg')?.setAttribute('fill', isLiked ? 'currentColor' : 'none');
          }
      });
    }
    if (state.currentView === 'detail') {
        const id = parseInt(UI.elements.detailCover?.dataset.albumId);
        if(id) {
            const isLiked = state.library.likedAlbums.has(id);
            const btn = UI.elements.likeAlbumBtn;
            if(btn) {
                btn.classList.toggle('liked', isLiked);
                btn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');
            }
        }
    }
  },
  
  renderTab(tabName) {
    const container = document.getElementById('libraryContent');
    if (!container) return;
    container.innerHTML = '';
    
    document.querySelectorAll('[data-lib-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.libTab === tabName);
    });
    
    if (tabName === 'songs') {
        const songs = Array.from(state.library.likedSongs.values());
        if(songs.length === 0) container.innerHTML = Utils.getEmptyState('No liked songs', 'Go find some music you love!');
        else {
            const wrapper = document.createElement('div');
            wrapper.className = 'charts-grid';
            wrapper.id = 'libSongsGrid';
            container.appendChild(wrapper);
            UI.renderTopCharts(songs, 'libSongsGrid');
        }
    } else if (tabName === 'albums') {
        const albums = Array.from(state.library.likedAlbums.values());
        if(albums.length === 0) container.innerHTML = Utils.getEmptyState('No saved albums', 'Save albums to your library.');
        else {
            const wrapper = document.createElement('div');
            wrapper.className = 'albums-grid-layout'; 
            wrapper.id = 'libAlbumsGrid';
            container.appendChild(wrapper);
            UI.renderAlbums(albums, 'libAlbumsGrid');
        }
    } else if (tabName === 'playlists') {
        container.innerHTML = `
            <div class="albums-grid-layout">
                <div class="album-card create-new-card" onclick="Playlist.openModal()">
                    <div class="create-new-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </div>
                    <div class="album-title" style="text-align:center;">Create Playlist</div>
                </div>
                ${state.playlists.map(pl => `
                    <div class="album-card" onclick="Playlist.open('${pl.id}')" oncontextmenu="event.preventDefault(); ContextMenu.show(event, {id:'${pl.id}'}, 'playlist')">
                            <div style="width:100%; aspect-ratio:1; background:${pl.color}; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:12px; box-shadow:var(--shadow-md);">
                            <svg viewBox="0 0 24 24" fill="#fff" width="48" height="48"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                            </div>
                            <div class="album-title">${pl.name}</div>
                            <div class="album-artist">${pl.tracks.length} songs</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
  }
};

// search

const Search = {
  async perform(query) {
    try {
      const [tracksData, albumsData] = await Promise.all([
        API.search(query, 'song', 20),
        API.search(query, 'album', 12)
      ]);
      const tracks = tracksData.results.filter(t => t.previewUrl);
      const albums = albumsData.results;
      this.renderResults(tracks, albums);
      Router.navigate('search');
    } catch (error) { Toast.show('Search failed', 'error'); }
  },
  
  renderResults(tracks, albums) {
    const container = UI.elements.searchResults;
    if (!container) return;
    container.innerHTML = `
      <div class="content-section"><h2 class="section-title">Songs</h2><div class="charts-grid" id="searchTracks"></div></div>
      <div class="content-section"><h2 class="section-title">Albums</h2><div class="albums-grid-layout" id="searchAlbums"></div></div>
    `;
    UI.renderTopCharts(tracks, 'searchTracks');
    UI.renderAlbums(albums, 'searchAlbums');
  }
};

// album detail

const Album = {
  async load(albumId) {
    try {
      state.currentAlbumId = parseInt(albumId);
      const data = await API.lookup(albumId);
      if (!data || !data.results || data.results.length === 0) { Toast.show('Album not found', 'error'); return; }
      
      const album = data.results[0];
      const tracks = data.results.slice(1).filter(t => t.previewUrl);
      this.render(album, tracks);
      Router.navigate('detail');
    } catch (error) { Toast.show('Failed to load album', 'error'); }
  },
  
  render(album, tracks) {
    if (UI.elements.detailCover) {
      UI.elements.detailCover.src = album.artworkUrl100.replace('100x100', '600x600');
      UI.elements.detailCover.dataset.albumId = album.collectionId;
    }
    if (UI.elements.detailTitle) UI.elements.detailTitle.textContent = album.collectionName;
    if (UI.elements.detailArtist) UI.elements.detailArtist.textContent = album.artistName;
    if (UI.elements.detailMeta) {
      const totalTime = tracks.reduce((sum, t) => sum + (t.trackTimeMillis || 0), 0);
      const hours = Math.floor(totalTime / (1000 * 60 * 60));
      const mins = Math.floor((totalTime % (1000 * 60 * 60)) / (1000 * 60));
      UI.elements.detailMeta.textContent = `${tracks.length} songs • ${hours}h ${mins}m`;
    }
    
    const playBtn = document.getElementById('playAllBtn');
    if(playBtn) {
        const newBtn = playBtn.cloneNode(true);
        playBtn.parentNode.replaceChild(newBtn, playBtn);
        UI.elements.playAllBtn = newBtn;
        
        newBtn.onclick = () => {
             const isPlayingThisAlbum = state.isPlaying && state.currentView === 'detail' && 
                                      (state.currentTrack && state.currentTrack.collectionId === album.collectionId);
             
             if(isPlayingThisAlbum) {
                 AudioController.togglePlay();
             } else {
                 if (tracks.length > 0) {
                    UI.playAll(tracks);
                 } else {
                    Toast.show('No playable tracks in this album', 'error');
                 }
             }
        };
    }
    
    state.tracks = tracks; 

    Library.updateLikeButtons();
    UI.renderTopCharts(tracks, 'detailTracks');
    UI.updatePlayButton();
  }
};

// app init
async function initializeApp() {
  try {
    Storage.load();
    ContextMenu.init();
    AudioController.init();
    UI.init();
    Playlist.renderSidebar();
    
    const [chartsData, releasesData] = await Promise.all([
      API.search('top hits', 'song', CONFIG.CHART_LIMIT),
      API.search('new music', 'album', CONFIG.DEFAULT_LIMIT)
    ]);
    const tracks = chartsData.results.filter(t => t.previewUrl);
    state.tracks = tracks; 
    
    UI.renderTopCharts(tracks);
    UI.renderAlbums(releasesData.results);
    
    const quickPicks = document.getElementById('quickPicks');
    if(quickPicks) {
        quickPicks.innerHTML = releasesData.results.slice(0, 6).map(item => `
            <div class="quick-pick-card" onclick="Album.load('${item.collectionId}')">
                <img src="${item.artworkUrl100}" alt="">
                <span>${Utils.escapeHtml(item.collectionName)}</span>
            </div>
        `).join('');
    }
    console.log('init done');
  } catch (error) { console.error('Init failed:', error); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

UI.playAll = function(tracks) {
  if (tracks && tracks.length > 0) {
    state.tracks = tracks;
    AudioController.play(tracks[0], 0);
  }
};