import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Search, BookOpen, MessageSquare, ShieldAlert, Cpu, 
  ChevronRight, ChevronLeft, RefreshCw, Sun, Moon, ArrowRight, Check, X,
  FileText, Globe, Lightbulb, Network, ZoomIn, ZoomOut, Maximize2, Minimize2, Eye, Type, RotateCw,
  Plus, Trash, Menu
} from 'lucide-react';
import './App.css';
import OnboardingGuide from './components/OnboardingGuide';

const getFolderDisplayName = (folder) => {
  if (!folder) return '기타';
  if (folder === 'knowledge') return '지식 위키';
  if (folder === 'knowledge/macro') return '지식/거시경제';
  if (folder === 'knowledge/institutions') return '지식/제도·기관';
  if (folder === 'knowledge/people') return '지식/인물·구루';
  if (folder === 'knowledge/tech_themes') return '지식/기술테마';
  if (folder === 'knowledge/industries') return '지식/산업';
  if (folder === 'knowledge/segments') return '지식/세그먼트';
  if (folder === 'knowledge/drafts') return '지식/초안';
  if (folder.startsWith('knowledge/')) {
    return `지식/${folder.substring(10)}`;
  }
  if (folder === 'snp500 report') return 'S&P 500 리포트';
  if (folder === 'macro report') return '매크로 리포트';
  if (folder === 'tech trend') return '기술 트렌드';
  if (folder === 'llmwiki chat') return '대화 기록';
  return folder;
};

const getFolderTagLabel = (folder) => {
  if (!folder) return '트렌드';
  if (folder.startsWith('knowledge')) {
    if (folder === 'knowledge') return '지식 위키';
    const sub = folder.substring(10);
    const subLabels = {
      'macro': '거시경제',
      'institutions': '제도·기관',
      'people': '인물·구루',
      'tech_themes': '기술테마',
      'industries': '산업',
      'segments': '세그먼트',
      'drafts': '초안'
    };
    return `지식/${subLabels[sub] || sub}`;
  }
  if (folder === 'snp500 report') return 'S&P 500';
  if (folder === 'macro report') return '매크로';
  return '트렌드';
};

function TreeNode({ node, onSelect, selectedPath }) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!node.isFolder) {
    const isSelected = selectedPath === node.docRef.path;
    return (
      <div 
        onClick={() => onSelect(node.docRef)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-surface-container-high transition-all ${
          isSelected ? 'bg-primary/15 text-primary font-bold shadow-sm' : 'text-on-surface-variant'
        }`}
      >
        <FileText size={14} className="shrink-0 text-primary/70" />
        <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
      </div>
    );
  }
  
  const childKeys = Object.keys(node.children);
  childKeys.sort((a, b) => {
    const aFolder = node.children[a].isFolder;
    const bFolder = node.children[b].isFolder;
    if (aFolder && !bFolder) return -1;
    if (!aFolder && bFolder) return 1;
    return a.localeCompare(b);
  });
  
  return (
    <div className="space-y-1">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs cursor-pointer hover:bg-surface-container-high text-on-surface font-semibold select-none transition-all"
      >
        <span className="material-symbols-outlined text-[16px] transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>
          chevron_right
        </span>
        <span className="material-symbols-outlined text-[16px] text-amber-500 shrink-0">
          {isOpen ? 'folder_open' : 'folder'}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      
      {isOpen && (
        <div className="pl-3 border-l border-outline-variant/30 ml-3.5 space-y-1">
          {childKeys.map(key => (
            <TreeNode 
              key={key} 
              node={node.children[key]} 
              onSelect={onSelect} 
              selectedPath={selectedPath} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  // 1. All State and Ref Hooks at the very top
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const fetchWithAuth = async (url, options = {}) => {
    const token = localStorage.getItem('session_token');
    const headers = {
      ...(options.headers || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, {
      ...options,
      headers,
    });
    if (res.status === 401) {
      if (!url.includes('/api/auth/')) {
        localStorage.removeItem('session_token');
        setIsAuthenticated(false);
      }
    }
    return res;
  };

  const handleLogout = () => {
    localStorage.removeItem('session_token');
    setIsAuthenticated(false);
  };

  const handlePasscodeLogin = async (e) => {
    e.preventDefault();
    if (!passcode) {
      setLoginError('접근 패스코드를 입력해 주세요.');
      return;
    }
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('session_token', data.token);
        setIsAuthenticated(true);
        setPasscode('');
      } else {
        const data = await res.json();
        setLoginError(data.detail || '비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('서버와의 통신에 실패했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeSessionId') ? 'explorer' : 'landing'); // 'landing' | 'explorer' | 'graph'
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [currentReportResponse, setCurrentReportResponse] = useState('');
  const [modelMode, setModelMode] = useState('default'); // 'default' | 'normal' | 'turbo'
  const [searchApprovalQueries, setSearchApprovalQueries] = useState(null);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [activeDraftPath, setActiveDraftPath] = useState(null);
  const [isModificationMode, setIsModificationMode] = useState(false);
  const [searchApprovalRequest, setSearchApprovalRequest] = useState(null);
  
  // Custom states for sidebar and focus mode
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  
  // Custom states for publishing & popups
  const [publishedPaths, setPublishedPaths] = useState(new Set());
  const [popupDoc, setPopupDoc] = useState(null);
  const [popupContent, setPopupContent] = useState('');
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isResearchActive, setIsResearchActive] = useState(() => {
    return localStorage.getItem('activeSessionId') ? true : false;
  });
  
  // --- Research Sessions & Floating Chat States (Antigravity 2.0) ---
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return localStorage.getItem('activeSessionId') || null;
  });
  const [isSessionListOpen, setIsSessionListOpen] = useState(() => {
    return localStorage.getItem('activeSessionId') ? true : false;
  });
  const [floatingChatHistory, setFloatingChatHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('floatingChatHistory');
      return saved ? JSON.parse(saved) : [{
        role: 'assistant',
        content: '안녕하세요! 저는 Agent-Guru 플로팅 Lite 비서입니다. 지식 검색 RAG 답변을 제공해 드립니다. ("프롬프트 다듬어줘"라고 하시면 입력하신 내용을 바탕으로 최적의 리서치 지침을 작성해 드려요!)',
        thoughts: []
      }];
    } catch (e) {
      return [];
    }
  });
  const [floatingChatInput, setFloatingChatInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFloatingGenerating, setIsFloatingGenerating] = useState(false);
  const [floatingThoughts, setFloatingThoughts] = useState([]);
  const [floatingResponse, setFloatingResponse] = useState('');
  const [planApprovalRequest, setPlanApprovalRequest] = useState(null);

  // Booklet states
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [bookletMode, setBookletMode] = useState('booklet'); // 'scroll' | 'booklet'
  const [bookletTheme, setBookletTheme] = useState('sepia'); // 'sepia' | 'white' | 'dark'
  const [bookletFontSize, setBookletFontSize] = useState('base'); // 'sm' | 'base' | 'lg' | 'xl'
  const [bookletCurrentPage, setBookletCurrentPage] = useState(0); // page index (0-based)

  // Report booklet states (for background reader)
  const [reportBookletMode, setReportBookletMode] = useState('booklet'); // 'scroll' | 'booklet'
  const [reportBookletTheme, setReportBookletTheme] = useState('white'); // 'sepia' | 'white' | 'dark'
  const [reportBookletFontSize, setReportBookletFontSize] = useState('base'); // 'sm' | 'base' | 'lg' | 'xl'
  const [reportBookletCurrentPage, setReportBookletCurrentPage] = useState(0); // page index (0-based)

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Popup booklet keydown listener (strictly 1-page view)
  useEffect(() => {
    if (!isPopupOpen) return;
    const handleKeyDown = (e) => {
      // Ignore key events when user is typing in inputs or textareas
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }
      if (bookletMode !== 'booklet') return;
      const pages = parseMarkdownToPages(popupContent);
      if (e.key === 'ArrowLeft') {
        setBookletCurrentPage(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setBookletCurrentPage(prev => Math.min(pages.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPopupOpen, bookletMode, popupContent]);

  // Background report booklet keydown listener (2-page view on desktop)
  useEffect(() => {
    if (isPopupOpen) return; // Ignore background events when popup is active
    if (!selectedDoc && !currentReportResponse) return;
    const handleKeyDown = (e) => {
      // Ignore key events when user is typing in inputs or textareas
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }
      if (reportBookletMode !== 'booklet') return;
      
      const content = selectedDoc ? docContent : currentReportResponse;
      const pages = parseMarkdownToPages(content || '');
      const isDoublePage = windowWidth >= 1024;
      const step = isDoublePage ? 2 : 1;

      if (e.key === 'ArrowLeft') {
        setReportBookletCurrentPage(prev => {
          const displayIndex = isDoublePage ? prev - (prev % 2) : prev;
          return Math.max(0, displayIndex - step);
        });
      } else if (e.key === 'ArrowRight') {
        setReportBookletCurrentPage(prev => {
          const displayIndex = isDoublePage ? prev - (prev % 2) : prev;
          return Math.min(pages.length - 1, displayIndex + step);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc, currentReportResponse, docContent, reportBookletMode, windowWidth, isPopupOpen]);
  
  // Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'assistant',
      content: '안녕하세요! 글로벌 리서치 에이전트 **Agent-Guru**입니다. S&P 500 기업 리포트, 거시경제 분석, 테크 동향 및 구루 포트폴리오를 포함한 전체 지식 베이스를 바탕으로 최상의 가이드라인을 제공합니다. 궁금한 내용을 질문해 주세요!',
      thoughts: []
    }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentThoughts, setCurrentThoughts] = useState([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [resourceStatus, setResourceStatus] = useState({ busy: false, message: '대기 중' });
  const [darkMode, setDarkMode] = useState(true);
  const [metaImprovement, setMetaImprovement] = useState(null);
  
  // Chat Window state (Floating Window)
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'knowledge' | 'snp500' | 'macro' | 'trend'

  // Graph state (Interactive SVG Map)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [graphNodes, setGraphNodes] = useState([]);
  const [graphLinks, setGraphLinks] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);

  const chatEndRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Floating Chat Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const chatRef = useRef(null);

  // Resizable Chat panel state
  const [chatSize, setChatSize] = useState({ width: 450, height: 600 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef({ x: 0, y: 0 });
  const resizeSizeStart = useRef({ width: 450, height: 600 });
  const resizeDirectionRef = useRef('tl');

  // Global font scale state
  const [fontScale, setFontScale] = useState('normal'); // 'small' | 'normal' | 'large' | 'huge'

  // Font scale effect
  useEffect(() => {
    const scales = {
      small: '0.85',
      normal: '1.0',
      large: '1.15',
      huge: '1.30'
    };
    document.documentElement.style.setProperty('--font-scale', scales[fontScale]);
  }, [fontScale]);

  // Chat resize listener effect
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      
      const dir = resizeDirectionRef.current;
      const newWidth = (dir === 'l' || dir === 'tl')
        ? Math.max(320, Math.min(1000, resizeSizeStart.current.width - dx))
        : resizeSizeStart.current.width;
        
      const newHeight = (dir === 't' || dir === 'tl')
        ? Math.max(400, Math.min(900, resizeSizeStart.current.height - dy))
        : resizeSizeStart.current.height;
      
      setChatSize({
        width: newWidth,
        height: newHeight
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeMouseDown = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeDirectionRef.current = direction;
    resizeStart.current = { x: e.clientX, y: e.clientY };
    resizeSizeStart.current = { ...chatSize };
  };

  // Effect to handle dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged.current = true;
      }
      
      const newX = positionStart.current.x + dx;
      const newY = positionStart.current.y + dy;

      const chatWidth = isChatOpen ? chatSize.width : 56;
      const chatHeight = isChatOpen ? chatSize.height : 56;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Allow dragging but keep within boundaries
      const minX = -(vw - chatWidth - 24);
      const maxX = 24;
      const minY = -(vh - chatHeight - 24);
      const maxY = 24;

      setPosition({
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isChatOpen]);

  // Effect to handle click outside chat container to close it
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isChatOpen && chatRef.current && !chatRef.current.contains(e.target)) {
        if (e.target.closest('.fixed.inset-0.z-50')) {
          return; // Ignore modal dialog clicks
        }
        setIsChatOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChatOpen]);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    
    // If chat is open, prevent drag if clicking any button/input inside the chat window
    if (isChatOpen) {
      if (
        e.target.closest('button') || 
        e.target.closest('a') || 
        e.target.closest('input') || 
        e.target.closest('textarea') || 
        e.target.closest('summary') ||
        e.target.closest('details')
      ) {
        return;
      }
    } else {
      // If chat is closed (minimized button), let the button be dragged,
      // but prevent drag if clicking on links or other interactive elements
      if (e.target.closest('a')) {
        return;
      }
    }
    
    setIsDragging(true);
    hasDragged.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    positionStart.current = { ...position };
    e.preventDefault();
  };

  // 2. Helper Functions (that can reference the hooks/states above safely)
  const preprocessMarkdown = (text) => {
    if (!text) return '';
    // Normalize newlines to \n to prevent GFM table parser failure on Windows \r\n line endings
    let processed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Fix common LLM syntax error where double backticks (``) are written instead of triple backticks (```) for code blocks
    processed = processed.replace(/^\s*``\s*$/gm, '```');

    // Fix range strike-through error where LLM outputs double tildes (~~) between numbers instead of a range tilde (~)
    processed = processed.replace(/(\d+(?:\.\d+)?%?)\s*~~\s*(\d+(?:\.\d+)?%?)/g, '$1~$2');

    // Process [[wiki]] links to #/wiki/target
    processed = processed.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, p1, p2) => {
      const target = p1.trim();
      const label = p2 ? p2.trim() : target;
      return `[${label}](#/wiki/${encodeURIComponent(target)})`;
    });
    // Process file:/// links to #/file/path
    processed = processed.replace(/\]\(file:\/\/\/([^)]+)\)/g, (match, p1) => {
      return `](#/file/${encodeURIComponent(p1)})`;
    });
    // Process file:// links to #/file/path
    processed = processed.replace(/\]\(file:\/\/([^)]+)\)/g, (match, p1) => {
      return `](#/file/${encodeURIComponent(p1)})`;
    });
    return processed;
  };

  const parseMarkdownToPages = (content) => {
    if (!content) return [''];
    
    // Clean frontmatter if present
    let cleaned = content.trim();
    if (cleaned.startsWith('---')) {
      const nextTripleDash = cleaned.indexOf('---', 3);
      if (nextTripleDash !== -1) {
        cleaned = cleaned.substring(nextTripleDash + 3).trim();
      }
    }

    // Split by horizontal rules first if present
    const hrRegex = /^\s*---\s*$/m;
    let initialBlocks = [];
    if (hrRegex.test(cleaned)) {
      initialBlocks = cleaned.split(hrRegex).map(p => p.trim()).filter(Boolean);
    } else {
      initialBlocks = [cleaned];
    }

    const pages = [];
    const headingRegex = /(?=^#{1,3}\s+)/m; // Matches #, ##, or ### at the start of a line
    
    initialBlocks.forEach(block => {
      const subparts = block.split(headingRegex).map(p => p.trim()).filter(Boolean);
      
      let currentPage = '';
      subparts.forEach(part => {
        // Smart merge: only split at a heading if current page has >= 800 chars,
        // or if combined text exceeds 2500 chars to avoid oversized pages.
        if (currentPage && (currentPage.length >= 800 || currentPage.length + part.length > 2500)) {
          pages.push(currentPage);
          currentPage = part;
        } else {
          if (currentPage) {
            currentPage += '\n\n' + part;
          } else {
            currentPage = part;
          }
        }
      });
      if (currentPage) {
        pages.push(currentPage);
      }
    });

    if (pages.length === 0) return [''];
    return pages;
  };

  const findDocumentInList = (list, title) => {
    if (!list || list.length === 0) return null;
    const clean = title.replace(/\.md$/, '').trim().toLowerCase();
    
    // 1. Try exact match first (case-insensitive)
    let found = list.find(d => d.title.replace(/\.md$/, '').trim().toLowerCase() === clean);
    if (found) return found;
    
    // 2. Try looser inclusion match (only if no exact match exists anywhere)
    // We only check if the document title contains the clean query (e.g. "Ray Dalio-soul" contains "Ray Dalio")
    // We do NOT check clean.includes(dt) because that causes specific long queries (e.g. date-prefixed reports)
    // to incorrectly match shorter generic files (e.g. matching "투자" or "전략" or "레이_달리오_투자_전략").
    found = list.find(d => {
      const dt = d.title.replace(/\.md$/, '').trim().toLowerCase();
      return dt.includes(clean);
    });
    return found || null;
  };

  const navigateToWiki = async (docTitle) => {
    const cleanTitle = docTitle.replace(/\.md$/, '').trim();
    let foundDoc = findDocumentInList(documents, cleanTitle);
    
    if (foundDoc) {
      selectDocument(foundDoc);
    } else {
      try {
        const res = await fetchWithAuth(`/api/documents?query=${encodeURIComponent(cleanTitle)}`);
        const data = await res.json();
        if (data && data.length > 0) {
          // If the title starts with a date pattern, do not fallback to any loose search result
          const isSpecific = /^\d{4}-\d{2}-\d{2}/.test(cleanTitle);
          const exactDoc = findDocumentInList(data, cleanTitle) || (isSpecific ? null : data[0]);
          if (exactDoc) {
            selectDocument(exactDoc);
          } else {
            alert(`문서 '${cleanTitle}'를 찾을 수 없습니다.`);
          }
        } else {
          alert(`문서 '${cleanTitle}'를 찾을 수 없습니다.`);
        }
      } catch (e) {
        console.error('Wiki link navigation error:', e);
      }
    }
  };

  const showDocumentPopup = async (docTitle) => {
    console.log("showDocumentPopup called with docTitle:", docTitle);
    const cleanTitle = docTitle.replace(/\.md$/, '').trim();
    let foundDoc = findDocumentInList(documents, cleanTitle);
    
    if (!foundDoc) {
      console.log("Document not found in memory, querying backend for:", cleanTitle);
      try {
        const res = await fetchWithAuth(`/api/documents?query=${encodeURIComponent(cleanTitle)}`);
        const data = await res.json();
        if (data && data.length > 0) {
          // If the title starts with a date pattern, do not fallback to any loose search result
          const isSpecific = /^\d{4}-\d{2}-\d{2}/.test(cleanTitle);
          foundDoc = findDocumentInList(data, cleanTitle) || (isSpecific ? null : data[0]);
          console.log("Backend query success, found doc:", foundDoc);
        }
      } catch (e) {
        console.error('Wiki link fetch error for popup:', e);
      }
    }

    if (foundDoc) {
      try {
        const res = await fetchWithAuth(`/api/documents/detail?path=${encodeURIComponent(foundDoc.path)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setPopupDoc(foundDoc);
        setPopupContent(data.content || '본문 내용이 비어있습니다.');
        setBookletCurrentPage(0); // Reset page index
        setIsPopupOpen(true);
        console.log("Successfully opened popup for doc:", foundDoc.title);
      } catch (e) {
        console.error('Failed to fetch doc content for popup:', e);
        alert(`문서 내용을 가져오는 데 실패했습니다. (${e.message})`);
      }
    } else {
      console.log("Document NOT found, showing alert");
      alert(`문서 '${cleanTitle}'를 찾을 수 없습니다.`);
    }
  };

  const MarkdownLink = ({ href, children, ...props }) => {
    console.log("MarkdownLink rendered/clicked. href:", href, "children:", children);
    const isWiki = href && href.startsWith('#/wiki/');
    const isFile = href && href.startsWith('#/file/');
    const isRelative = href && !href.includes('://') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:') && !href.startsWith('#/wiki/') && !href.startsWith('#/file/');
    const isLocalHost = href && (href.includes('127.0.0.1') || href.includes('localhost'));
    
    const isLocalPopup = isWiki || isFile || isRelative || isLocalHost;
    console.log("Link classification:", { isWiki, isFile, isRelative, isLocalHost, isLocalPopup });
    
    if (isLocalPopup) {
      let docTitle = '';
      if (isWiki) {
        docTitle = decodeURIComponent(href.replace('#/wiki/', ''));
      } else if (isFile) {
        const decoded = decodeURIComponent(href.replace('#/file/', ''));
        const baseName = decoded.split(/[\\/]/).pop() || '';
        docTitle = baseName.replace(/\.md$/, '').split('#')[0].trim();
      } else {
        const decoded = decodeURIComponent(href);
        const baseName = decoded.split(/[\\/]/).pop() || '';
        docTitle = baseName.replace(/\.md$/, '').split('#')[0].trim();
      }
      console.log("Derived docTitle:", docTitle);
      if (docTitle) {
        return (
          <a 
            href="#" 
            onClick={(e) => {
              console.log("Local popup link clicked! docTitle:", docTitle);
              e.preventDefault();
              showDocumentPopup(docTitle);
            }}
            className="text-primary hover:underline font-bold"
            {...props}
          >
            {children}
          </a>
        );
      }
    }
    console.log("Falling back to standard target=_blank link for:", href);
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" {...props}>{children}</a>;
  };

  const Mermaid = ({ chart }) => {
    const [svg, setSvg] = useState('');
    const [error, setError] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const idRef = useRef(`mermaid-${Math.floor(Math.random() * 1000000)}`);

    useEffect(() => {
      const scriptId = 'mermaid-cdn-script';
      let script = document.getElementById(scriptId);
      
      const initializeMermaid = () => {
        try {
          window.mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'loose',
            fontFamily: 'inherit',
          });
          setLoaded(true);
        } catch (err) {
          console.error("Failed to initialize mermaid:", err);
          setError("그래프 초기화 실패");
        }
      };

      if (window.mermaid) {
        initializeMermaid();
      } else {
        if (!script) {
          script = document.createElement('script');
          script.id = scriptId;
          script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
          script.async = true;
          document.body.appendChild(script);
        }

        const handleScriptLoad = () => {
          initializeMermaid();
        };

        script.addEventListener('load', handleScriptLoad);
        return () => {
          script.removeEventListener('load', handleScriptLoad);
        };
      }
    }, []);

    useEffect(() => {
      if (!loaded || !chart) return;

      let isMounted = true;
      
      // Sanitize chart code to support link syntax and avoid parser crashes
      let cleanChart = String(chart).trim();
      try {
        const links = [];
        const bracketTypes = [
          { open: '\\[', close: '\\]', styleOpen: '[', styleClose: ']' },
          { open: '\\(', close: '\\)', styleOpen: '(', styleClose: ')' },
          { open: '\\{', close: '\\}', styleOpen: '{', styleClose: '}' },
        ];
        
        for (const b of bracketTypes) {
          const regex = new RegExp(`([a-zA-Z0-9_-]+)${b.open}([^${b.close}]+)${b.close}\\(([^\\)]+)\\)`, 'g');
          cleanChart = cleanChart.replace(regex, (match, nodeId, label, url) => {
            const cleanLabel = label.replace(/"/g, '\\"');
            links.push(`click ${nodeId} href "${url}"`);
            return `${nodeId}${b.styleOpen}"${cleanLabel}"${b.styleClose}`;
          });
        }
        
        if (links.length > 0) {
          cleanChart += '\n' + links.join('\n');
        }
      } catch (e) {
        console.error("Failed to sanitize mermaid chart:", e);
      }

      window.mermaid.render(idRef.current, cleanChart)
        .then(({ svg: renderedSvg }) => {
          if (isMounted) {
            setSvg(renderedSvg);
            setError(null);
          }
        })
        .catch((err) => {
          console.error("Mermaid rendering error:", err);
          if (isMounted) {
            setError("그래프를 그리는 도중 오류가 발생했습니다.");
          }
          try {
            const badDiv = document.getElementById(idRef.current);
            if (badDiv) badDiv.remove();
            const badDivBind = document.getElementById(`d${idRef.current}`);
            if (badDivBind) badDivBind.remove();
          } catch (e) {}
        });

      return () => {
        isMounted = false;
      };
    }, [loaded, chart]);

    if (error) {
      return (
        <div className="p-4 my-3 bg-rose-500/10 border border-rose-500/30 rounded-xl font-mono text-xs text-rose-500">
          <div className="font-bold mb-1">⚠️ {error}</div>
          <pre className="overflow-x-auto whitespace-pre-wrap mt-2 opacity-80">{chart}</pre>
        </div>
      );
    }

    if (!loaded || !svg) {
      return (
        <div className="p-8 my-3 bg-surface-container-low border border-outline-variant/30 rounded-xl flex flex-col items-center justify-center gap-2 select-none">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[10px] text-outline font-semibold">그래프 렌더링 중...</span>
        </div>
      );
    }

    return (
      <div 
        className="p-4 my-4 bg-white border border-outline-variant/20 rounded-xl flex justify-center overflow-x-auto shadow-sm"
        dangerouslySetInnerHTML={{ __html: svg }} 
      />
    );
  };

  const MarkdownComponents = {
    a: MarkdownLink,
    code({ node, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children || '').trim();
      const isMermaid = (match && match[1] === 'mermaid') || 
                        codeStr.startsWith('graph ') || 
                        codeStr.startsWith('graph\n') ||
                        codeStr.startsWith('graph\r\n') ||
                        codeStr.startsWith('flowchart ') || 
                        codeStr.startsWith('flowchart\n') ||
                        codeStr.startsWith('flowchart\r\n') ||
                        codeStr.startsWith('sequenceDiagram') || 
                        codeStr.startsWith('gantt') || 
                        codeStr.startsWith('classDiagram') || 
                        codeStr.startsWith('stateDiagram');
      
      if (isMermaid) {
        return <Mermaid chart={codeStr} />;
      }
      return match ? (
        <pre className="p-4 my-3 bg-surface-container-low border border-outline-variant/30 rounded-xl overflow-x-auto font-mono text-sm leading-relaxed text-on-surface-variant select-text">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      ) : (
        <code className="px-1.5 py-0.5 rounded bg-outline-variant/20 text-on-surface font-mono text-[0.9em]" {...props}>
          {children}
        </code>
      );
    }
  };

  const buildTree = (docs) => {
    const root = { name: 'Root', isFolder: true, children: {} };
    
    docs.forEach(doc => {
      const parts = doc.rel_path.split(/[\\/]/);
      let current = root;
      
      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        if (isLast) {
          current.children[part] = {
            name: part,
            isFolder: false,
            docRef: doc
          };
        } else {
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              isFolder: true,
              children: {}
            };
          }
          current = current.children[part];
        }
      });
    });
    
    return root;
  };

  // 1. Authenticate and load config/Passcode Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        const configRes = await fetch('/api/auth/config');
        if (!configRes.ok) {
          throw new Error(`Auth config returned status ${configRes.status}`);
        }
        const configData = await configRes.json();
        const authEnabled = !!configData.is_auth_enabled;
        setIsAuthEnabled(authEnabled);

        if (!authEnabled) {
          setIsAuthenticated(true);
          setIsAuthLoading(false);
          return;
        }

        const storedToken = localStorage.getItem('session_token');
        if (storedToken) {
          try {
            const verifyRes = await fetch('/api/auth/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: storedToken })
            });
            if (verifyRes.ok) {
              setIsAuthenticated(true);
              setIsAuthLoading(false);
              return;
            } else {
              localStorage.removeItem('session_token');
              setIsAuthenticated(false);
            }
          } catch (e) {
            console.error("Stored token verification failed:", e);
            localStorage.removeItem('session_token');
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }

        setIsAuthLoading(false);
      } catch (err) {
        console.error("Failed to initialize auth:", err);
        setIsAuthenticated(false);
        setIsAuthLoading(false);
      }
    };

    initAuth();
  }, []);

  // 2. Load documents and check resource status once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchDocuments();
      checkResourceStatus();
      fetchSessions();
      const interval = setInterval(checkResourceStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Sync floating chat history to localStorage
  useEffect(() => {
    localStorage.setItem('floatingChatHistory', JSON.stringify(floatingChatHistory));
  }, [floatingChatHistory]);

  // Load session messages when active session ID changes and sync to localStorage
  useEffect(() => {
    if (activeSessionId) {
      loadSessionMessages(activeSessionId);
      localStorage.setItem('activeSessionId', activeSessionId);
    } else {
      localStorage.removeItem('activeSessionId');
    }
  }, [activeSessionId]);

  // Auto-restore draft document and active stream subscription when sessions list or active session changes
  useEffect(() => {
    if (activeSessionId && sessions.length > 0) {
      const activeSess = sessions.find(s => s.id === activeSessionId);
      if (activeSess) {
        if (activeSess.active_draft_path && (!selectedDoc || selectedDoc.path !== activeSess.active_draft_path)) {
          selectDocument({
            path: activeSess.active_draft_path,
            title: activeSess.title + " (초안)",
            folder: 'knowledge/drafts',
            category: 'Deep Research',
            size: 0
          });
        }
        // Also if it is generating and we are not currently generating (e.g. on page refresh), reconnect!
        if (activeSess.generating && !isGenerating) {
          reconnectActiveStream(activeSessionId);
        }
      }
    }
  }, [sessions, activeSessionId, isGenerating]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, currentResponse, currentThoughts, isChatOpen]);

  // Build the visual 2D Graph Nodes once documents are loaded
  useEffect(() => {
    if (documents.length === 0) return;
    
    // Group documents by folder to cluster them
    const groups = {
      'knowledge': [],
      'snp500 report': [],
      'macro report': [],
      'tech trend': [],
      'llmwiki chat': [],
      'other': []
    };

    documents.forEach(doc => {
      let folder = doc.folder || 'other';
      if (folder.startsWith('knowledge')) {
        folder = 'knowledge';
      }
      if (groups[folder]) {
        groups[folder].push(doc);
      } else {
        groups['other'].push(doc);
      }
    });

    // Center coordinates for clusters
    const centers = {
      'knowledge': { x: 200, y: 180 },
      'snp500 report': { x: 500, y: 150 },
      'macro report': { x: 150, y: 400 },
      'tech trend': { x: 450, y: 380 },
      'llmwiki chat': { x: 320, y: 280 },
      'other': { x: 320, y: 280 }
    };

    const nodes = [];
    const links = [];

    // Calculate node coordinates around cluster centers
    Object.keys(groups).forEach(folder => {
      const docs = groups[folder];
      const center = centers[folder] || centers['other'];
      const count = docs.length;
      
      docs.forEach((doc, index) => {
        let x, y;
        if (count === 1) {
          x = center.x;
          y = center.y;
        } else {
          const angle = (index / count) * 2 * Math.PI;
          const radius = 70 + Math.random() * 25; // radial offset
          x = center.x + radius * Math.cos(angle);
          y = center.y + radius * Math.sin(angle);
        }

        nodes.push({
          id: doc.path,
          title: doc.title,
          folder: doc.folder,
          category: doc.category,
          x,
          y,
          docRef: doc
        });
      });
    });

    // Generate links based on actual WikiLinks
    documents.forEach(docA => {
      const sourceNode = nodes.find(n => n.id === docA.path);
      if (!sourceNode) return;
      
      const docALinks = docA.links || [];
      docALinks.forEach(linkedTitle => {
        const targetDoc = documents.find(d => 
          d.title.toLowerCase() === linkedTitle.toLowerCase()
        );
        if (targetDoc) {
          const targetNode = nodes.find(n => n.id === targetDoc.path);
          if (targetNode && sourceNode.id !== targetNode.id) {
            const exists = links.some(l => 
              (l.source.id === sourceNode.id && l.target.id === targetNode.id) ||
              (l.source.id === targetNode.id && l.target.id === sourceNode.id)
            );
            if (!exists) {
              links.push({
                source: sourceNode,
                target: targetNode,
                id: `link-${sourceNode.id}-${targetNode.id}`
              });
            }
          }
        }
      });
    });

    setGraphNodes(nodes);
    setGraphLinks(links);
  }, [documents]);

  const checkResourceStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/status');
      const data = await res.json();
      setResourceStatus(data);
    } catch (e) {
      console.error('Failed to fetch status:', e);
    }
  };

  const fetchDocuments = async (query = '') => {
    try {
      const res = await fetchWithAuth(`/api/documents?query=${encodeURIComponent(query)}&fast=true`);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error('Failed to fetch documents:', e);
    }
  };

  const handleRefreshDocuments = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetchWithAuth('/api/documents/refresh', {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || '성공적으로 GCP 버킷과 동기화되었습니다.');
        await fetchDocuments(searchQuery);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
    } catch (e) {
      console.error('Failed to sync with GCP bucket:', e);
      alert(`GCP 동기화 실패: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSearchChange = (e) => {
    const q = typeof e === 'string' ? e : e.target.value;
    setSearchQuery(q);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchDocuments(q);
    }, 250);
  };

  const handlePublish = async (draftPath) => {
    if (publishedPaths.has(draftPath)) return;
    
    setPublishedPaths(prev => {
      const next = new Set(prev);
      next.add(draftPath);
      return next;
    });

    try {
      const res = await fetchWithAuth('/api/documents/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_path: draftPath })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || '발행 실패');
      }
      const data = await res.json();
      alert(data.message || '성공적으로 발행되었습니다.');
      // Refresh documents
      fetchDocuments(searchQuery);
      // Select the published document
      selectDocument({
        title: data.title,
        path: data.path,
        folder: 'llmwiki chat',
        category: 'Deep Research',
        size: 0
      });
      // Clear active draft path
      setActiveDraftPath(null);
      
      // Reset research session
      setIsResearchActive(false);
      setIsSidebarOpen(true);
      
      if (activeSessionId) {
        try {
          await fetchWithAuth(`/api/research/sessions/${activeSessionId}`, {
            method: 'DELETE'
          });
          await fetchSessions();
          setActiveSessionId(null);
        } catch (sessErr) {
          console.error("Failed to delete session on publish:", sessErr);
        }
      }
      
      // Reset chat history
      setChatHistory([
        {
          role: 'assistant',
          content: '보고서 발행이 완료되었습니다! 새로운 대화나 리서치를 시작하실 수 있습니다.',
          thoughts: []
        }
      ]);
    } catch (e) {
      console.error(e);
      setPublishedPaths(prev => {
        const next = new Set(prev);
        next.delete(draftPath);
        return next;
      });
      alert(`발행 중 오류 발생: ${e.message}`);
    }
  };

  const selectDocument = async (doc) => {
    setSelectedDoc(doc);
    setReportBookletCurrentPage(0); // Reset page index when selecting a new document
    if (doc.path && (doc.path.includes('knowledge/drafts') || doc.path.includes('knowledge\\drafts'))) {
      setActiveDraftPath(doc.path);
    } else {
      setActiveDraftPath(null);
    }
    // Auto switch to explorer view to view document details
    setActiveTab('explorer');
    try {
      const res = await fetchWithAuth(`/api/documents/detail?path=${encodeURIComponent(doc.path)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDocContent(data.content || '본문 내용이 비어있습니다.');
    } catch (e) {
      console.error('Failed to load document content:', e);
      setDocContent(`문서를 읽어오는 데 실패했습니다. (${e.message})`);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setCurrentResponse(prev => prev + '\n\n⚠️ 사용자에 의해 분석이 중단되었습니다.');
    setCurrentThoughts([]);
    setCurrentReportResponse('');
  };

  const fetchSessions = async () => {
    try {
      const res = await fetchWithAuth('/api/research/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  };

  const loadSessionMessages = async (sessId) => {
    try {
      const res = await fetchWithAuth(`/api/research/sessions/${sessId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const history = data.map(msg => ({
          role: msg.role,
          content: msg.content,
          thoughts: msg.thoughts ? JSON.parse(msg.thoughts) : []
        }));
        setChatHistory(history.length > 0 ? history : [{
          role: 'assistant',
          content: '새 리서치 세션이 시작되었습니다. 원하시는 리서치 주제나 분석 대상을 입력해 주세요.',
          thoughts: []
        }]);
      }
    } catch (err) {
      console.error("Failed to load session messages:", err);
    }
  };

  const handleCreateSession = async (title = '새 리서치 세션', mode = 'normal', autoStartQuery = null) => {
    try {
      const res = await fetchWithAuth('/api/research/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, model_mode: mode })
      });
      if (res.ok) {
        const newSess = await res.json();
        await fetchSessions();
        setActiveSessionId(newSess.id);
        setModelMode(newSess.model_mode);
        setCurrentReportResponse('');
        setIsSidebarOpen(false);
        setIsResearchActive(true);
        setActiveTab('explorer');

        if (autoStartQuery) {
          setChatHistory([{
            role: 'assistant',
            content: `새 리서치 세션이 시작되었습니다. 주제: "${autoStartQuery}"`,
            thoughts: []
          }]);
          setTimeout(() => {
            handleChatSubmit(null, autoStartQuery, newSess.id);
          }, 150);
        } else {
          setChatHistory([{
            role: 'assistant',
            content: '새 리서치 세션이 시작되었습니다. 원하시는 리서치 주제나 분석 대상을 입력해 주세요.',
            thoughts: []
          }]);
        }
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const handleDeleteSession = async (sessId, e) => {
    if (e) e.stopPropagation();
    if (!confirm("정말 이 세션을 삭제하시겠습니까? 관련 대화 기록이 모두 소실됩니다.")) return;
    try {
      const res = await fetchWithAuth(`/api/research/sessions/${sessId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchSessions();
        if (activeSessionId === sessId) {
          setActiveSessionId(null);
          setChatHistory([{
            role: 'assistant',
            content: '리서치를 개시하려면 왼쪽 세션 목록에서 세션을 선택하거나 [새 세션]을 생성해 주세요.',
            thoughts: []
          }]);
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleClearFloatingChat = () => {
    if (confirm("대화 기록을 초기화하시겠습니까?")) {
      setFloatingChatHistory([{
        role: 'assistant',
        content: '안녕하세요! 저는 Agent-Guru 플로팅 Lite 비서입니다. 지식 검색 RAG 답변을 제공해 드립니다. ("프롬프트 다듬어줘"라고 하시면 입력하신 내용을 바탕으로 최적의 리서치 지침을 작성해 드려요!)',
        thoughts: []
      }]);
      setFloatingResponse('');
      setFloatingThoughts([]);
    }
  };

  const handleAddSessionClick = () => {
    const title = prompt("새로운 리서치 주제를 입력해 주세요:", "새 리서치 주제");
    if (title && title.trim()) {
      handleCreateSession(title.trim(), 'normal', title.trim());
    }
  };

  const handleNewChat = async () => {
    handleStopGeneration();
    setChatHistory([
      {
        role: 'assistant',
        content: '안녕하세요! 글로벌 리서치 에이전트 **Agent-Guru**입니다. S&P 500 기업 리포트, 거시경제 분석, 테크 동향 및 구루 포트폴리오를 포함한 전체 지식 베이스를 바탕으로 최상의 가이드라인을 제공합니다. 궁금한 내용을 질문해 주세요!',
        thoughts: []
      }
    ]);
    setChatInput('');
    setCurrentResponse('');
    setCurrentThoughts([]);
    setCurrentReportResponse('');
    setSelectedDoc(null);
    setActiveDraftPath(null);
    setIsModificationMode(false);
    setSearchApprovalRequest(null);

    try {
      await fetchWithAuth('/api/documents/clear_drafts', { method: 'POST' });
      fetchDocuments(searchQuery);
    } catch (e) {
      console.error('Failed to clear drafts on new chat:', e);
    }
  };

  const handleNewResearchClick = async () => {
    handleStopGeneration();
    const title = prompt("새로운 리서치 주제를 입력해 주세요:", "새 리서치 주제");
    if (title && title.trim()) {
      await handleCreateSession(title.trim(), 'normal', title.trim());
    }
  };

  const handleExitResearch = () => {
    setIsResearchActive(false);
    setIsSidebarOpen(true);
  };

  const handleSearchApproval = async (approved) => {
    if (!searchApprovalRequest) return;
    try {
      await fetch('/api/chat/approve_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: searchApprovalRequest.requestId,
          approved: approved
        })
      });
    } catch (err) {
      console.error('Failed to send search approval decision:', err);
    } finally {
      setSearchApprovalRequest(null);
    }
  };

  const handleFloatingChatSubmit = async (e) => {
    e.preventDefault();
    if (!floatingChatInput.trim() || isFloatingGenerating) return;

    const userMessage = floatingChatInput.trim();
    setFloatingChatInput('');
    setFloatingChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsFloatingGenerating(true);
    setFloatingThoughts([]);
    setFloatingResponse('');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetchWithAuth('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          query: userMessage, 
          model_mode: 'default',
          chat_type: 'floating',
          chat_history: floatingChatHistory
            .map(h => ({ role: h.role, content: h.content }))
        })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';
      let accumulatedResponse = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        buffer += decoder.decode(value, { stream: !done });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = jsonParseSSE(line);
              if (event.type === 'thought') {
                setFloatingThoughts(prev => [...prev, event.text]);
              } else if (event.type === 'content') {
                accumulatedResponse += event.text;
                setFloatingResponse(accumulatedResponse);
              }
            } catch (err) {
              console.error('Failed to parse floating event line:', line, err);
            }
          }
        }
      }

      setFloatingChatHistory(prev => [...prev, {
        role: 'assistant',
        content: accumulatedResponse || '답변을 완성하지 못했습니다.',
        thoughts: []
      }]);
      setFloatingResponse('');
      setFloatingThoughts([]);
      setIsFloatingGenerating(false);
    } catch (err) {
      console.error('Floating SSE Error:', err);
      setFloatingChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ 에러가 발생했습니다: ${err.message}`,
        thoughts: []
      }]);
      setIsFloatingGenerating(false);
    }
  };

  const handleChatSubmit = async (e, overrideQuery = null, overrideSessionId = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const userMessage = overrideQuery ? overrideQuery.trim() : chatInput.trim();
    if (!userMessage || isGenerating) return;

    if (!overrideQuery) {
      setChatInput('');
    }
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsGenerating(true);
    setCurrentThoughts([]);
    setCurrentResponse('');
    setCurrentReportResponse('');
    setSelectedDoc(null);
    setMetaImprovement(null);

    try {
      const statusRes = await fetchWithAuth('/api/status');
      const statusData = await statusRes.json();
      setResourceStatus(statusData);
      if (statusData.busy) {
        setChatHistory(prev => [...prev, { 
          role: 'assistant', 
          content: '⚠️ 지금 로컬 모델 자원이 예약작업(백그라운드 분석 등)에 사용 중에 있으니 나중에 요청하시기 바랍니다.',
          thoughts: [] 
        }]);
        setIsGenerating(false);
        return;
      }
    } catch (err) {
      console.error(err);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let currentSessId = overrideSessionId || activeSessionId;
      if (isResearchActive && !currentSessId) {
        // Auto-create session on message submit
        const title = userMessage.length > 20 ? userMessage.substring(0, 20) + "..." : userMessage;
        try {
          const res = await fetchWithAuth('/api/research/sessions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, model_mode: modelMode })
          });
          if (res.ok) {
            const newSess = await res.json();
            currentSessId = newSess.id;
            setActiveSessionId(newSess.id);
            await fetchSessions();
          } else {
            throw new Error("세션 생성 실패");
          }
        } catch (err) {
          console.error("Failed to auto-create session:", err);
          setChatHistory(prev => [...prev, {
            role: 'assistant',
            content: '⚠️ 리서치 세션을 생성하지 못했습니다. 왼쪽 세션 목록에서 [새 세션]을 만들어 주세요.',
            thoughts: []
          }]);
          setIsGenerating(false);
          return;
        }
      }

      const response = await fetchWithAuth('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          query: userMessage, 
          model_mode: modelMode, 
          draft_path: activeDraftPath,
          is_modification_mode: isModificationMode,
          chat_history: chatHistory
            .filter(h => h.type !== 'search_status')
            .map(h => ({ role: h.role, content: h.content })),
          session_id: isResearchActive ? currentSessId : null,
          chat_type: 'research'
        })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';
      let accumulatedResponse = '';
      let accumulatedReport = '';
      let isWaitingForSearchApproval = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        buffer += decoder.decode(value, { stream: !done });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = jsonParseSSE(line);
              if (event.type === 'thought') {
                setCurrentThoughts(prev => [...prev, event.text]);
              } else if (event.type === 'search_approval_required') {
                setSearchApprovalRequest({ requestId: event.request_id, query: event.query });
              } else if (event.type === 'reasoning') {
                // Ignore raw token reasoning in thoughts list to keep it clean
              } else if (event.type === 'report_chunk') {
                setSelectedDoc(null);
                accumulatedReport += event.text;
                setCurrentReportResponse(accumulatedReport);
              } else if (event.type === 'report_path') {
                setCurrentReportResponse('');
                accumulatedReport = '';
                setActiveDraftPath(event.path);
                selectDocument({
                  title: event.title,
                  path: event.path,
                  folder: 'knowledge/drafts',
                  category: 'Deep Research',
                  size: 0
                });
              } else if (event.type === 'content') {
                accumulatedResponse += event.text;
                setCurrentResponse(accumulatedResponse);
              } else if (event.type === 'meta_improve') {
                setMetaImprovement(event.instruction);
              } else if (event.type === 'status' && event.status === 'busy') {
                accumulatedResponse = '⚠️ 지금 로컬 모델 자원이 예약작업(백그라운드 분석 등)에 사용 중에 있으니 나중에 요청하시기 바랍니다.';
                setCurrentResponse(accumulatedResponse);
                done = true;
              } else if (event.type === 'search_request') {
                setSearchApprovalQueries(event.queries);
                setLastUserMessage(userMessage);
                isWaitingForSearchApproval = true;
                done = true;
              } else if (event.type === 'plan_approval_required') {
                setPlanApprovalRequest({ 
                  planId: event.plan_id, 
                  planSteps: event.plan_steps, 
                  query: event.query 
                });
                isWaitingForSearchApproval = true; // behaves similarly to halt stream
                done = true;
              } else if (event.type === 'verification_completed') {
                // Yield verification checklist as an assistant event bubble
                setChatHistory(prev => [...prev, {
                  role: 'assistant',
                  content: event.verification_details,
                  thoughts: []
                }]);
              }
            } catch (e) {
              console.error('Failed to parse event line:', line, e);
            }
          }
        }
      }

      if (!isWaitingForSearchApproval) {
        setChatHistory(prev => [...prev, {
          role: 'assistant',
          content: accumulatedResponse || (accumulatedReport ? '보고서 생성이 완료되었습니다. 왼쪽 지식 탐색기에서 확인해 주세요.' : '답변을 완성하지 못했습니다.'),
          thoughts: [] // Delete thoughts from the completed chat history bubble
        }]);
        setCurrentResponse('');
        setCurrentThoughts([]);
        setCurrentReportResponse('');
        setIsGenerating(false);
      } else {
        setIsGenerating(false);
      }
      
      // Reload document list and sessions list
      fetchDocuments(searchQuery);
      fetchSessions();
    } catch (e) {
      console.error('SSE Error:', e);
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ 에러가 발생했습니다: ${e.message}`,
        thoughts: []
      }]);
      setIsGenerating(false);
    }
  };

  const reconnectActiveStream = async (sessId) => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    setCurrentThoughts([]);
    setCurrentResponse('');
    setCurrentReportResponse('');
    setMetaImprovement(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetchWithAuth('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          query: '(Reconnecting...)',
          model_mode: modelMode, 
          draft_path: activeDraftPath,
          chat_history: [],
          session_id: sessId,
          chat_type: 'research'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedResponse = '';
      let accumulatedReport = '';
      let accumulatedThoughts = [];

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        const lines = chunkValue.split('\n');
        
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const event = jsonParseSSE(line);
              if (event.type === 'reasoning') {
                accumulatedThoughts.push(event.text);
                setCurrentThoughts([...accumulatedThoughts]);
              } else if (event.type === 'report_chunk') {
                accumulatedReport += event.text;
                setCurrentReportResponse(accumulatedReport);
              } else if (event.type === 'report_path') {
                setCurrentReportResponse('');
                accumulatedReport = '';
                setActiveDraftPath(event.path);
                selectDocument({
                  title: event.title,
                  path: event.path,
                  folder: 'knowledge/drafts',
                  category: 'Deep Research',
                  size: 0
                });
              } else if (event.type === 'content') {
                accumulatedResponse += event.text;
                setCurrentResponse(accumulatedResponse);
              } else if (event.type === 'meta_improve') {
                setMetaImprovement(event.instruction);
              } else if (event.type === 'verification_completed') {
                setChatHistory(prev => [...prev, {
                  role: 'assistant',
                  content: event.verification_details,
                  thoughts: []
                }]);
              }
            } catch (e) {
              console.error('Failed to parse event line:', line, e);
            }
          }
        }
      }

      await loadSessionMessages(sessId);
      setIsGenerating(false);
      fetchSessions();
      fetchDocuments(searchQuery);

    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Re-connect Error:', e);
        setIsGenerating(false);
      }
    }
  };

  const jsonParseSSE = (line) => {
    try {
      if (line.startsWith('data: ')) {
        return JSON.parse(line.substring(6));
      }
      return JSON.parse(line);
    } catch (err) {
      console.error('JSON parsing failed:', err);
      throw err;
    }
  };

  const acceptImprovement = async () => {
    if (!metaImprovement) return;
    try {
      const res = await fetchWithAuth('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule: metaImprovement })
      });
      const data = await res.json();
      alert(data.message || '규칙이 반영되었습니다.');
      setMetaImprovement(null);
    } catch (e) {
      console.error(e);
      alert('규칙 반영에 실패했습니다.');
    }
  };

  // Filter documents displayed in explorer list
  const filteredDocuments = documents.filter(doc => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'knowledge') return doc.folder && doc.folder.startsWith('knowledge');
    if (activeFilter === 'snp500') return doc.folder === 'snp500 report';
    if (activeFilter === 'macro') return doc.folder === 'macro report';
    if (activeFilter === 'trend') return doc.folder === 'tech trend';
    return true;
  });

  const getChatFontClasses = (width) => {
    const inputFont = width > 700 
      ? 'text-base py-3 px-4.5 max-h-40' 
      : width > 500 
        ? 'text-sm py-2.5 px-4 max-h-32' 
        : 'text-xs py-2 px-3.5 max-h-24';
    const buttonSize = width > 700
      ? 'w-12 h-12 rounded-2xl'
      : width > 500
        ? 'w-10 h-10 rounded-xl'
        : 'w-8 h-8 rounded-xl';
    const messageFont = width > 700
      ? 'text-base p-5'
      : width > 500
        ? 'text-sm p-4'
        : 'text-[13px] p-3.5';
    return { inputFont, buttonSize, messageFont };
  };

  const renderChatPanelContent = (isDocked = false) => {
    // Determine active values based on docked state (research vs floating Q&A)
    const history = isDocked ? chatHistory : floatingChatHistory;
    const isGen = isDocked ? isGenerating : isFloatingGenerating;
    const thoughts = isDocked ? currentThoughts : floatingThoughts;
    const response = isDocked ? currentResponse : floatingResponse;
    const input = isDocked ? chatInput : floatingChatInput;
    const setInput = isDocked ? setChatInput : setFloatingChatInput;
    const handleSubmit = isDocked ? handleChatSubmit : handleFloatingChatSubmit;
    const handleStop = isDocked ? handleStopGeneration : () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setIsFloatingGenerating(false);
    };

    const width = isDocked ? (isSessionListOpen ? 420 : 400) : chatSize.width;
    const { inputFont: inputFontClass, buttonSize: buttonSizeClass, messageFont: messageFontClass } = getChatFontClasses(width);

    return (
      <div className={`w-full h-full flex overflow-hidden relative ${isDocked ? 'bg-surface-container' : 'glass border border-primary/30 rounded-2xl shadow-2xl flex-col'}`}>
        
        {/* Left Side: Sessions Sidebar (Only in Docked mode and when list is toggled open) */}
        {isDocked && isSessionListOpen && (
          <div className="w-[200px] border-r border-outline-variant/30 flex flex-col bg-surface-container-low shrink-0 h-full overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between shrink-0 bg-surface-container-high">
              <span className="font-bold text-xs text-on-surface">리서치 세션 목록</span>
              <button 
                onClick={handleAddSessionClick}
                className="p-1 rounded-md text-primary hover:bg-primary/10 transition-colors"
                title="새 세션 생성"
              >
                <Plus size={16} />
              </button>
            </div>
            {/* Session List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-outline">생성된 세션이 없습니다.</div>
              ) : (
                sessions.map(sess => (
                  <div 
                    key={sess.id}
                    onClick={() => {
                      setActiveSessionId(sess.id);
                      setModelMode(sess.model_mode);
                      
                      // Restore session active draft if it exists
                      if (sess.active_draft_path) {
                        selectDocument({ 
                          path: sess.active_draft_path, 
                          title: sess.title + " (초안)",
                          folder: 'knowledge/drafts',
                          category: 'Deep Research',
                          size: 0
                        });
                      } else {
                        setSelectedDoc(null);
                        setDocContent('');
                        setActiveDraftPath(null);
                      }
                      
                      // Reconnect to active stream if generating
                      if (sess.generating) {
                        reconnectActiveStream(sess.id);
                      }
                    }}
                    className={`group p-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-all ${
                      activeSessionId === sess.id
                        ? 'bg-primary/10 border-l-4 border-primary text-primary font-bold'
                        : 'hover:bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-[11px]">{sess.title}</span>
                        {sess.generating && (
                          <RefreshCw className="animate-spin text-primary flex-shrink-0" size={10} />
                        )}
                      </div>
                      <span className={`text-[9px] w-max px-1 py-0.2 rounded mt-0.5 font-bold ${
                        sess.model_mode === 'turbo' 
                          ? 'bg-purple-500/10 text-purple-500' 
                          : 'bg-blue-500/10 text-blue-500'
                      }`}>
                        {sess.model_mode === 'turbo' ? 'PRO' : 'NORMAL'}
                      </span>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-error hover:bg-error/10 transition-all ml-1 shrink-0"
                      title="세션 삭제"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Right Side: Chat Panel Container */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div 
            onMouseDown={isDocked ? undefined : handleMouseDown}
            className={`p-4 bg-primary text-on-primary flex items-center justify-between select-none ${isDocked ? '' : 'cursor-move'}`}
          >
            <div className="flex items-center gap-2">
              {isDocked && (
                <button
                  onClick={() => setIsSessionListOpen(!isSessionListOpen)}
                  className={`p-1 rounded hover:bg-white/10 transition-colors mr-1 ${isSessionListOpen ? 'bg-white/20' : ''}`}
                  title="세션 목록 토글"
                >
                  <Menu size={16} />
                </button>
              )}
              <MessageSquare className="w-5 h-5 animate-bounce" />
              <span className="font-bold text-[14px]">
                {isDocked ? 'Agent-Guru (리서치 세션)' : 'Agent-Guru AI'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isGen && (
                <div className="flex items-center bg-white/10 px-2 py-0.5 rounded text-[9px] font-bold animate-pulse">
                  ⚡ ACTIVE
                </div>
              )}
              {isDocked ? (
                <>
                  <button 
                    onClick={handleAddSessionClick}
                    className="opacity-75 hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-[10px] flex items-center gap-1 font-bold transition-all"
                    title="새 리서치 시작"
                  >
                    <Plus size={12} />
                    <span>새 세션</span>
                  </button>
                  <button 
                    onClick={handleExitResearch}
                    className="opacity-70 hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-[10px] flex items-center gap-1 font-bold transition-all"
                    title="리서치 세션 종료"
                  >
                    <X size={12} />
                    <span>종료</span>
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={handleClearFloatingChat}
                    className="opacity-75 hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-[10px] flex items-center gap-1 font-bold transition-all"
                    title="대화 초기화"
                  >
                    <RefreshCw size={12} />
                    <span>초기화</span>
                  </button>
                  <button 
                    onClick={() => setIsChatOpen(false)}
                    className="opacity-70 hover:opacity-100 p-0.5 rounded-full hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Model Mode & Modification Mode Toggle Bar (Only for Docked mode) */}
          {isDocked && (
            <div className="px-4 py-2 bg-surface-container border-b border-outline-variant/30 flex flex-col gap-2 text-[11px] shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-bold text-on-surface-variant flex items-center gap-1">
                  <Cpu size={14} className="text-primary" />
                  대화 모드:
                </span>
                <div className="flex bg-surface-container-high rounded-full p-0.5 border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setModelMode('normal')}
                    className={`px-3 py-0.5 rounded-full text-[9px] font-extrabold transition-all duration-200 ${
                      modelMode !== 'turbo'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant/70 hover:bg-surface-container-highest'
                    }`}
                    title="일반 리서치 모드 (Gemini 3.5 Flash)"
                  >
                    일반 (3.5 Flash)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelMode('turbo')}
                    className={`px-3 py-0.5 rounded-full text-[9px] font-extrabold transition-all duration-200 ${
                      modelMode === 'turbo'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant/70 hover:bg-surface-container-highest'
                    }`}
                    title="심층 띵킹 리서치 모드 (Gemini 3.1 Pro)"
                  >
                    심층 띵킹 (3.1 Pro)
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between border-t border-outline-variant/10 pt-1.5">
                <span className="font-bold text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-amber-500">edit_note</span>
                  보고서 수정 모드:
                </span>
                <button
                  type="button"
                  onClick={() => setIsModificationMode(!isModificationMode)}
                  className={`px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase transition-all duration-200 ${
                    isModificationMode 
                      ? 'bg-amber-600 text-white shadow-sm' 
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                  title="발행 전 드래프트 보고서의 수정/보완을 활성화합니다."
                >
                  {isModificationMode ? 'ON (수정)' : 'OFF (신규)'}
                </button>
              </div>
            </div>
          )}

          {/* Message Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-container-lowest/50">
            {history.map((msg, idx) => {
              if (msg.type === 'search_status') {
                return (
                  <div key={idx} className="flex justify-center my-2 animate-fade-in">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <span className="material-symbols-outlined text-[13px]">find_in_page</span>
                      <span>{msg.content}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-outline font-bold mb-1">{msg.role === 'user' ? '사용자' : 'Agent-Guru'}</span>
                  
                  {/* Thoughts Timeline */}
                  {msg.thoughts && msg.thoughts.length > 0 && (
                    <details className="w-full max-w-[90%] bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 mb-2 text-xs">
                      <summary className="cursor-pointer text-[11px] font-bold text-primary hover:underline select-none">
                        RAG 및 다단계 추론 스캔 ({msg.thoughts.length}단계 완료)
                      </summary>
                      <ul className="mt-2 space-y-1.5 border-l-2 border-primary/20 pl-3">
                        {msg.thoughts.map((t, tIdx) => (
                          <li key={tIdx} className="text-on-surface-variant leading-relaxed text-[11px]">
                            {t}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className={`max-w-[90%] rounded-2xl leading-relaxed ${messageFontClass} ${
                    msg.role === 'user' 
                      ? 'bg-primary text-on-primary rounded-tr-none' 
                      : 'bg-surface-container border border-outline-variant/30 text-on-background rounded-tl-none markdown-body'
                  }`}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {preprocessMarkdown(msg.content)}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Streaming Content */}
            {isGen && (
              <div className="flex flex-col items-start">
                <span className="text-[10px] text-outline font-bold mb-1">Agent-Guru</span>
                
                {/* Live Thought Stream */}
                {thoughts.length > 0 && (
                  <div className="w-full max-w-[90%] bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 mb-2 text-xs">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary mb-1">
                      <RefreshCw className="animate-spin" size={12} />
                      <span>생각하는 중...</span>
                    </div>
                    <ul className="space-y-1.5 border-l-2 border-primary/20 pl-3">
                      {thoughts.map((t, tIdx) => (
                        <li key={tIdx} className={`text-on-surface-variant text-[11px] ${tIdx === thoughts.length - 1 ? 'font-bold text-primary animate-pulse' : ''}`}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {response && (
                  <div className={`max-w-[90%] rounded-2xl leading-relaxed bg-surface-container border border-outline-variant/30 text-on-background rounded-tl-none markdown-body ${messageFontClass}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                      {preprocessMarkdown(response)}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Meta Improvement Panel (Only for Docked) */}
          {isDocked && metaImprovement && (
            <div className="p-4 bg-surface-container border-t border-outline-variant/40 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-primary mb-1">
                <Lightbulb size={14} className="text-amber-500" />
                <span>행동 가이드라인 학습 제안</span>
              </div>
              <p className="text-[11px] text-on-surface-variant mb-2">질문에서 감지된 아래 가이드라인을 학습하여 대화 규칙에 반영할까요?</p>
              <div className="p-2 bg-surface-container-high rounded border border-outline-variant/20 italic mb-3">"{metaImprovement}"</div>
              <div className="flex gap-2">
                <button onClick={acceptImprovement} className="flex-1 py-1.5 bg-primary text-on-primary rounded font-bold hover:opacity-90">반영 승인</button>
                <button onClick={() => setMetaImprovement(null)} className="flex-1 py-1.5 bg-surface-container-highest text-on-surface rounded font-bold hover:bg-surface-container-high">무시</button>
              </div>
            </div>
          )}

          {/* Input Footer */}
          <form onSubmit={handleSubmit} className="p-3 bg-surface border-t border-outline-variant/30 flex items-end gap-2">
            <textarea 
              placeholder={resourceStatus.busy ? "예약작업 중으로 대화가 제한됩니다." : (isDocked && searchApprovalRequest) ? "웹 검색 승인이 진행 중입니다..." : "질문 입력..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isGen || resourceStatus.busy || (isDocked && !!searchApprovalRequest)}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className={`flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary resize-none overflow-y-auto ${inputFontClass}`}
            />
            {isGen ? (
              <button 
                type="button" 
                onClick={handleStop}
                className={`bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shrink-0 animate-pulse ${buttonSizeClass}`}
                title="분석 중단"
              >
                <X size={16} />
              </button>
            ) : (
              <button 
                type="submit" 
                disabled={!input.trim() || resourceStatus.busy || (isDocked && !!searchApprovalRequest)}
                className={`bg-primary text-on-primary flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shrink-0 ${buttonSizeClass}`}
              >
                <ArrowRight size={16} />
              </button>
            )}
          </form>
        </div>
      </div>
    );
  };

    if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-primary dark">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wide">인증 정보 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black text-on-background dark overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-sm p-8 rounded-3xl bg-surface-container/30 border border-outline-variant/35 backdrop-blur-xl shadow-2xl flex flex-col items-center z-10 transition-all duration-300">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mb-6">
            <Cpu className="text-primary w-8 h-8 animate-pulse" />
          </div>
          
          <h1 className="text-2xl font-extrabold text-primary tracking-tight mb-1">Second Brain</h1>
          <p className="text-xs font-semibold text-on-surface-variant tracking-widest uppercase mb-6">AI Research Hub</p>
          
          <div className="w-full h-px bg-outline-variant/20 mb-6"></div>
          
          <p className="text-xs text-on-surface-variant/90 text-center mb-6 leading-relaxed max-w-[280px]">
            허용된 사용자만 접근할 수 있는 개인 연구 공간입니다. 시스템 접근 비밀번호를 입력해 주세요.
          </p>

          <form onSubmit={handlePasscodeLogin} className="w-full space-y-4">
            <div className="relative">
              <input
                type="password"
                placeholder="비밀번호 입력"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                disabled={isLoggingIn}
                className="w-full px-4 py-3 rounded-xl bg-surface-container/60 border border-outline-variant/30 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all text-sm pr-10 text-center"
              />
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[18px]">
                lock
              </span>
            </div>

            {loginError && (
              <div className="text-[11px] text-error font-medium text-center bg-error/10 py-2 px-3 rounded-lg border border-error/20 flex items-center justify-center gap-1.5 animate-fade-in">
                <span className="material-symbols-outlined text-[14px]">warning</span>
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>시스템 접속하기</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-[10px] text-on-surface-variant/70 font-mono tracking-wider">
            Second Brain v1.0.0
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-screen h-screen overflow-hidden bg-background text-on-background ${darkMode ? 'dark' : ''}`}>
      
      {/* 1. Sidebar Navigation (Left) - Animated collapsing */}
      <aside className={`h-full flex flex-col py-6 border-r border-outline-variant/30 bg-surface z-40 transition-all duration-300 ${
        (isFocusMode || !isSidebarOpen) ? 'w-0 overflow-hidden opacity-0 border-r-0' : 'w-[280px]'
      }`}>
        <div className="px-6 mb-8 shrink-0">
          <div className="flex items-center gap-2">
            <Cpu className="text-primary w-6 h-6 animate-pulse" />
            <h1 className="text-xl font-extrabold text-primary tracking-tight">Second Brain</h1>
          </div>
          <p className="text-[10px] font-semibold text-on-surface-variant tracking-widest uppercase mt-1">AI Research Hub</p>
        </div>

        {/* Tab Links */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <button 
            onClick={() => {
              setActiveTab('landing');
              setIsResearchActive(false);
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${
              activeTab === 'landing' 
                ? 'text-primary border-r-4 border-primary bg-surface-container-low font-bold scale-[0.98]' 
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined mr-3">home</span>
            <span className="text-[14px]">Home (소개)</span>
          </button>

          <button 
            id="sidebar-explorer"
            onClick={() => {
              setActiveTab('explorer');
              setIsResearchActive(false);
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${
              activeTab === 'explorer' 
                ? 'text-primary border-r-4 border-primary bg-surface-container-low font-bold scale-[0.98]' 
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined mr-3">folder</span>
            <span className="text-[14px]">Knowledge Explorer</span>
          </button>
          
          <button 
            id="sidebar-graph"
            onClick={() => {
              setActiveTab('graph');
              setIsResearchActive(false);
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${
              activeTab === 'graph' 
                ? 'text-primary border-r-4 border-primary bg-surface-container-low font-bold scale-[0.98]' 
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined mr-3">account_tree</span>
            <span className="text-[14px]">Knowledge Graph</span>
          </button>
          <button 
            id="sidebar-research"
            onClick={() => {
              setActiveTab('explorer');
              setIsResearchActive(true);
              setIsSessionListOpen(true);
              
              // Restore active draft for the current session if it exists
              if (activeSessionId) {
                const activeSess = sessions.find(s => s.id === activeSessionId);
                if (activeSess) {
                  if (activeSess.active_draft_path) {
                    selectDocument({ 
                      path: activeSess.active_draft_path, 
                      title: activeSess.title + " (초안)",
                      folder: 'knowledge/drafts',
                      category: 'Deep Research',
                      size: 0
                    });
                  }
                  if (activeSess.generating) {
                    reconnectActiveStream(activeSessionId);
                  }
                }
              }
            }}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${
              activeTab === 'explorer' && isResearchActive
                ? 'text-primary border-r-4 border-primary bg-surface-container-low font-bold scale-[0.98]' 
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined mr-3">science</span>
            <span className="text-[14px]">AI Research</span>
          </button>
        </nav>

        {/* Database Status Info */}
        <div className="px-4 mt-auto">
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 relative overflow-hidden">
            <p className="text-[9px] font-bold text-on-surface-variant tracking-widest uppercase mb-1">Database Status</p>
            <div className="flex items-center justify-between mt-1 mb-2">
              <p className="text-[13px] font-bold text-primary truncate">Obsidian Wiki</p>
              <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                resourceStatus.doc_count > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
              }`}>
                {resourceStatus.status || '연동 완료'}
              </span>
            </div>
            <div className="space-y-1 text-[10px] text-on-surface-variant font-mono border-t border-outline-variant/20 pt-2">
              <div className="flex justify-between">
                <span>문서 수:</span>
                <span className="font-semibold text-primary">{resourceStatus.doc_count || 0}개</span>
              </div>
              <div className="flex justify-between">
                <span>최신 갱신:</span>
                <span className="font-semibold text-primary truncate max-w-[90px]">{resourceStatus.last_updated || '기록 없음'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Profile & Log Out */}
        {isAuthEnabled && (
          <div className="px-4 mt-4">
            <div className="p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-bold text-on-surface-variant tracking-widest uppercase">Logged In As</p>
                <p className="text-xs font-semibold text-on-surface truncate">관리자 계정</p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-error/15 hover:text-error text-on-surface-variant transition-colors flex items-center justify-center shrink-0"
                title="로그아웃"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Workspace Panel */}
      <div className="flex-1 h-full flex flex-col overflow-hidden relative">
        
        {/* Header Bar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-outline-variant/30 bg-surface/70 backdrop-blur-md z-30">
          <div className="flex items-center gap-4 flex-1">
            {!isFocusMode && (
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant transition-all"
                title={isSidebarOpen ? "사이드바 접기" : "사이드바 펼치기"}
              >
                <span className="material-symbols-outlined text-[20px] block">
                  {isSidebarOpen ? 'menu_open' : 'menu'}
                </span>
              </button>
            )}
            <div className="relative w-full max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input 
                type="text" 
                placeholder="지식 문서 / 기업명 / 리포트 검색..." 
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-full py-1.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            
            <button
              onClick={handleRefreshDocuments}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm shrink-0 ${
                isSyncing 
                  ? 'bg-surface-container-highest border-outline text-outline scale-[0.98]' 
                  : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'
              }`}
              title="GCP 클라우드 스토리지 버킷 파일 동기화 및 갱신"
            >
              <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? '동기화 중...' : 'GCP 동기화'}</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Focus Mode Toggle Button */}
            <button 
              id="focus-toggle"
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold ${
                isFocusMode 
                  ? 'bg-primary text-on-primary border-primary shadow-lg shadow-primary/20 scale-[0.98]' 
                  : 'hover:bg-surface-container text-on-surface-variant border-outline-variant/40'
              }`}
              title="포커스 모드 토글 (모든 패널을 접고 문서에만 집중)"
            >
              <Eye size={14} className={isFocusMode ? "animate-pulse" : ""} />
              <span>{isFocusMode ? '포커스 모드 ON' : '포커스 모드'}</span>
            </button>

            <button 
              onClick={() => {
                const sizes = ['small', 'normal', 'large', 'huge'];
                const nextIdx = (sizes.indexOf(fontScale) + 1) % sizes.length;
                setFontScale(sizes[nextIdx]);
              }}
              className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors flex items-center gap-1"
              title={`글자 크기 변경 (현재: ${
                fontScale === 'small' ? '작게' :
                fontScale === 'normal' ? '보통' :
                fontScale === 'large' ? '크게' : '아주 크게'
              })`}
            >
              <Type size={18} />
              <span className="text-[9px] font-bold uppercase">{fontScale === 'small' ? 'A-' : fontScale === 'normal' ? 'A' : fontScale === 'large' ? 'A+' : 'A++'}</span>
            </button>

            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              onClick={() => { fetchDocuments(); checkResourceStatus(); }}
              className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {/* Dynamic Workspace Content */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* TAB 0: LANDING PAGE */}
          {activeTab === 'landing' && (
            <div className="flex-1 h-full overflow-y-auto bg-surface-container-lowest/30 p-8">
              <div className="max-w-4xl mx-auto space-y-12 py-6">
                
                {/* Hero Section */}
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-2">
                    <Cpu size={12} className="animate-spin-slow" />
                    Agentic Second Brain Platform
                  </div>
                  <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-primary via-blue-500 to-indigo-500 bg-clip-text text-transparent">
                    Agent-Guru AI
                  </h1>
                  <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto leading-relaxed">
                    로컬 지식 베이스와 실시간 웹 검색, 구루 투자 철학을 융합하는 차세대 자율형 리서치 에이전트 허브
                  </p>
                  
                  <div className="pt-6">
                    <button
                      onClick={() => setActiveTab('explorer')}
                      className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-on-primary font-bold px-8 py-3 rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 transition-all transform hover:-translate-y-0.5"
                    >
                      <span>리서치 시작하기 (Get Started)</span>
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>

                {/* Core Features Grid */}
                <div className="space-y-6">
                  <h2 className="text-2xl font-extrabold text-on-surface tracking-tight text-center">🌟 핵심 기능 (Core Features)</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant/30 hover:border-primary/30 transition-all space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Cpu size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-on-surface">하이브리드 모델 (Normal / Turbo)</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        실시간 성능 토글 스위치(Normal: gemini-3.5-flash / Turbo: gemini-3.1-pro-preview)를 지원하여 연산 비용 효율성을 극대화합니다.
                      </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant/30 hover:border-primary/30 transition-all space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <Network size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-on-surface">컨텍스트 분류 및 계획 수립</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        사용자 질문의 의도를 분석하여 단순 대화(Chat)와 리서치(RAG)를 자동 분류하고, 다단계 지식 탐색 계획을 기획하여 시각화합니다.
                      </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant/30 hover:border-primary/30 transition-all space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                        <Lightbulb size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-on-surface">구루 포트폴리오 스크리닝</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        워런 버핏, 피터 린치 등 21인 구루들의 철학과 정량 필터링 공식을 반영하여 기업 재무 정보를 스크리닝하고 최적의 자산 배분 비중을 도출합니다.
                      </p>
                    </div>

                    <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant/30 hover:border-primary/30 transition-all space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <BookOpen size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-on-surface">초안-발행 워크플로우 & 위키 동기화</h3>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        임시 초안에서 지속적인 챗 피드백으로 보완된 보고서를 1클릭으로 위키에 발행하며, 로컬 Google Drive Obsidian과 GCS 간 동기화를 처리합니다.
                      </p>
                    </div>

                  </div>
                </div>

                {/* System Architecture (Visual Timeline) */}
                <div className="space-y-6">
                  <h2 className="text-2xl font-extrabold text-on-surface tracking-tight text-center">🏗️ 에이전트 리서치 흐름 (Workflow)</h2>
                  <div className="relative border-l-2 border-outline-variant/30 pl-6 ml-4 space-y-8">
                    
                    <div className="relative">
                      <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-primary border-4 border-background"></span>
                      <h4 className="text-sm font-bold text-on-surface">1. 의도 자동 분석 (Intent Classification)</h4>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                        사용자 질문을 분석하여 일반 대화, 모호한 질문, RAG 심층 리서치 등으로 가볍게 라우팅합니다.
                      </p>
                    </div>

                    <div className="relative">
                      <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-background"></span>
                      <h4 className="text-sm font-bold text-on-surface">2. 다단계 지식 탐색 및 로컬 RAG</h4>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                        질문에 대한 유의어를 확장하고, 로컬 Obsidian Wiki 데이터베이스(MCP 스킬)에서 1차 지식을 검색합니다.
                      </p>
                    </div>

                    <div className="relative">
                      <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-amber-500 border-4 border-background"></span>
                      <h4 className="text-sm font-bold text-on-surface">3. 외부 검색 승인식 그라운딩 (Grounding Tool)</h4>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                        로컬 지식이 부족한 경우, 외부 검색 승인 알림창을 띄워 사용자 동의를 얻은 후 구글 검색(최대 4회)을 수행하여 정보 왜곡(할루시네이션)을 원천 차단합니다.
                      </p>
                    </div>

                    <div className="relative">
                      <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background"></span>
                      <h4 className="text-sm font-bold text-on-surface">4. 보고서 합성 및 위키 발행</h4>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                        수집 및 학습된 투자 지식을 결합해 최종 마크다운 보고서 초안을 작성하며, 확인 버튼을 눌러 위키 색인 문서로 영구 저장합니다.
                      </p>
                    </div>

                  </div>
                </div>

                {/* Technology Stack */}
                <div className="p-6 rounded-3xl bg-surface-container-high/60 border border-outline-variant/20 text-center space-y-4">
                  <h3 className="text-lg font-bold text-on-surface">⚙️ Tech Stack & Ecosystem</h3>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono text-on-surface-variant">
                    <span className="px-3 py-1 rounded-full bg-surface-container">React (Vite)</span>
                    <span className="px-3 py-1 rounded-full bg-surface-container">TailwindCSS</span>
                    <span className="px-3 py-1 rounded-full bg-surface-container">FastAPI (Python)</span>
                    <span className="px-3 py-1 rounded-full bg-surface-container">Vertex AI</span>
                    <span className="px-3 py-1 rounded-full bg-surface-container">Cloud Run (FUSE)</span>
                    <span className="px-3 py-1 rounded-full bg-surface-container">Google Cloud Storage</span>
                    <span className="px-3 py-1 rounded-full bg-surface-container">Obsidian Vault</span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 1: KNOWLEDGE EXPLORER & VIEWER */}
          {activeTab === 'explorer' && (
            <div className="flex-1 flex h-full overflow-hidden">
              
              {/* Left Pane: Document List or Active Research Chat */}
              {isResearchActive ? (
                <div className={`h-full border-r border-outline-variant/30 bg-surface flex flex-col overflow-hidden transition-all duration-300 shrink-0 ${
                  isFocusMode 
                    ? 'w-0 border-r-0 overflow-hidden opacity-0' 
                    : isSessionListOpen 
                      ? 'w-[580px] xl:w-[620px]' 
                      : 'w-[380px] xl:w-[420px]'
                }`}>
                  {renderChatPanelContent(true)}
                </div>
              ) : (
                <section className={`w-[350px] h-full border-r border-outline-variant/30 bg-surface/40 flex flex-col overflow-hidden transition-all duration-300 ${
                  isFocusMode ? 'w-0 border-r-0 overflow-hidden opacity-0' : ''
                }`}>
                  {/* Filter Chips */}
                  <div className="p-4 border-b border-outline-variant/20">
                    <div className="flex flex-wrap gap-1">
                      {['all', 'knowledge', 'snp500', 'macro', 'trend'].map(filter => (
                        <button
                          key={filter}
                          onClick={() => setActiveFilter(filter)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-all ${
                            activeFilter === filter 
                              ? 'bg-primary text-on-primary' 
                              : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                          }`}
                        >
                          {filter === 'all' ? '전체' :
                           filter === 'knowledge' ? '지식' :
                           filter === 'snp500' ? 'S&P 500' :
                           filter === 'macro' ? '매크로' : '트렌드'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* List Container */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredDocuments.length === 0 ? (
                      <div className="text-center py-8 text-xs text-outline">일치하는 문서가 없습니다.</div>
                    ) : searchQuery.trim() === '' ? (
                      <div className="space-y-1">
                        {Object.keys(buildTree(filteredDocuments).children).map(key => (
                          <TreeNode 
                            key={key} 
                            node={buildTree(filteredDocuments).children[key]} 
                            onSelect={selectDocument} 
                            selectedPath={selectedDoc?.path} 
                          />
                        ))}
                      </div>
                    ) : (
                      filteredDocuments.map((doc, idx) => (
                        <div 
                          key={idx}
                          onClick={() => selectDocument(doc)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer group ${
                            selectedDoc?.path === doc.path 
                              ? 'bg-surface border-primary shadow-sm' 
                              : 'bg-surface-container-lowest border-outline-variant/30 hover:border-primary/50'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              (doc.folder && doc.folder.startsWith('knowledge')) ? 'bg-primary-container text-on-primary-container' :
                              doc.folder === 'snp500 report' ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-container text-on-tertiary-container'
                            }`}>
                              {getFolderTagLabel(doc.folder)}
                            </span>
                            <span className="text-[9px] text-outline font-mono">{(doc.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <h3 className="text-[13px] font-bold group-hover:text-primary transition-colors line-clamp-1">{doc.title}</h3>
                          {doc.category && <p className="text-[10px] text-on-surface-variant mt-1">{doc.category}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              {/* Right Pane: Document Details */}
              <main className="flex-1 h-full overflow-y-auto bg-surface-container-lowest p-8 transition-all duration-300">
                {isFocusMode && (
                  <div className="max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto mb-6 flex justify-end">
                    <button
                      onClick={() => setIsFocusMode(false)}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 border border-primary/20"
                      title="포커스 모드 종료"
                    >
                      <Eye size={12} />
                      <span>포커스 모드 종료</span>
                    </button>
                  </div>
                )}
                
                {selectedDoc || currentReportResponse ? (() => {
                  const reportContent = selectedDoc ? docContent : currentReportResponse;
                  const reportPages = parseMarkdownToPages(reportContent || '');
                  const isReportBooklet = reportBookletMode === 'booklet';
                  const isReportDoublePage = isReportBooklet && windowWidth >= 1024;
                  
                  const reportCurrentPageClamped = Math.max(0, Math.min(reportBookletCurrentPage, reportPages.length - 1));
                  const reportDisplayIndex = isReportDoublePage ? reportCurrentPageClamped - (reportCurrentPageClamped % 2) : reportCurrentPageClamped;

                  const reportThemeClass = reportBookletTheme === 'sepia'
                    ? 'theme-paper-sepia'
                    : reportBookletTheme === 'white'
                      ? 'theme-paper-white'
                      : 'theme-paper-dark';

                  const reportFontSizeClass = reportBookletFontSize === 'sm'
                    ? 'text-sm'
                    : reportBookletFontSize === 'lg'
                      ? 'text-lg'
                      : reportBookletFontSize === 'xl'
                        ? 'text-xl'
                        : 'text-base';

                  const handleReportPrev = () => {
                    const step = isReportDoublePage ? 2 : 1;
                    setReportBookletCurrentPage(prev => Math.max(0, reportDisplayIndex - step));
                  };

                  const handleReportNext = () => {
                    const step = isReportDoublePage ? 2 : 1;
                    setReportBookletCurrentPage(prev => Math.min(reportPages.length - 1, reportDisplayIndex + step));
                  };

                  return (
                    <div className="max-w-[95vw] mx-auto w-full flex flex-col animate-in fade-in duration-300">
                      {/* Document Details Header */}
                      <div className="mb-4 pb-4 border-b border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                        <div>
                          {selectedDoc ? (
                            <>
                              <div className="flex items-center gap-1.5 text-xs text-outline mb-1 font-semibold">
                                <BookOpen size={12} className="text-primary" />
                                <span>{selectedDoc.folder}</span>
                              </div>
                              <h2 className="text-xl md:text-2xl font-bold text-on-background">{selectedDoc.title}</h2>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 text-xs text-outline mb-1 font-semibold">
                                <RefreshCw className="animate-spin text-primary" size={12} />
                                <span className="text-primary font-bold">실시간 심층 리서치 보고서 작성 중...</span>
                              </div>
                              <h2 className="text-xl md:text-2xl font-bold text-on-background">AI 리서치 분석 결과</h2>
                            </>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {/* Booklet Option Bar */}
                          <div className="flex items-center gap-3 bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/20 shadow-sm">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setReportBookletTheme('sepia')} className={`w-4 h-4 rounded-full bg-[#f3ece0] border transition-all ${reportBookletTheme === 'sepia' ? 'ring-2 ring-primary border-white scale-110 shadow-sm' : 'border-outline-variant/40 hover:scale-105'}`} title="세피아 미색지" />
                              <button onClick={() => setReportBookletTheme('white')} className={`w-4 h-4 rounded-full bg-[#faf9f6] border transition-all ${reportBookletTheme === 'white' ? 'ring-2 ring-primary border-slate-300 scale-110 shadow-sm' : 'border-outline-variant/40 hover:scale-105'}`} title="백색지" />
                              <button onClick={() => setReportBookletTheme('dark')} className={`w-4 h-4 rounded-full bg-[#1e1b18] border transition-all ${reportBookletTheme === 'dark' ? 'ring-2 ring-primary border-slate-600 scale-110 shadow-sm' : 'border-outline-variant/40 hover:scale-105'}`} title="다크 매거진" />
                            </div>
                            <div className="w-[1px] h-3.5 bg-outline-variant/30" />
                            <div className="flex items-center gap-1">
                              <button onClick={() => { if (reportBookletFontSize === 'xl') setReportBookletFontSize('lg'); else if (reportBookletFontSize === 'lg') setReportBookletFontSize('base'); else if (reportBookletFontSize === 'base') setReportBookletFontSize('sm'); }} disabled={reportBookletFontSize === 'sm'} className="w-5 h-5 flex items-center justify-center border border-outline-variant/50 rounded hover:bg-outline-variant/10 disabled:opacity-30 disabled:pointer-events-none text-[10px] font-bold text-on-background transition-colors" title="글자 크기 축소">A-</button>
                              <span className="w-8 text-center text-[9px] text-outline font-bold uppercase select-none">{reportBookletFontSize}</span>
                              <button onClick={() => { if (reportBookletFontSize === 'sm') setReportBookletFontSize('base'); else if (reportBookletFontSize === 'base') setReportBookletFontSize('lg'); else if (reportBookletFontSize === 'lg') setReportBookletFontSize('xl'); }} disabled={reportBookletFontSize === 'xl'} className="w-5 h-5 flex items-center justify-center border border-outline-variant/50 rounded hover:bg-outline-variant/10 disabled:opacity-30 disabled:pointer-events-none text-[10px] font-bold text-on-background transition-colors" title="글자 크기 확대">A+</button>
                            </div>
                            <div className="w-[1px] h-3.5 bg-outline-variant/30" />
                            <button onClick={() => setReportBookletMode(reportBookletMode === 'booklet' ? 'scroll' : 'booklet')} className={`p-1 rounded-lg transition-all border ${reportBookletMode === 'booklet' ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-transparent text-outline border-outline-variant/50 hover:bg-outline-variant/10 hover:text-on-background'}`} title={reportBookletMode === 'booklet' ? '종스크롤 아티클 모드로 변경' : '책자 넘김 매거진 모드로 변경'}>
                              {reportBookletMode === 'booklet' ? <BookOpen size={14} /> : <FileText size={14} />}
                            </button>
                          </div>

                          {selectedDoc && selectedDoc.path && (selectedDoc.path.includes('knowledge/drafts') || selectedDoc.path.includes('knowledge\drafts')) && (
                            <button
                              onClick={() => handlePublish(selectedDoc.path)}
                              disabled={publishedPaths.has(selectedDoc.path)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                                publishedPaths.has(selectedDoc.path)
                                  ? 'bg-outline/20 text-on-surface/40 cursor-not-allowed'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                            >
                              <Check size={14} />
                              <span>{publishedPaths.has(selectedDoc.path) ? '발행 완료' : '발행 및 저장'}</span>
                            </button>
                          )}
                          {selectedDoc ? (
                            <span className="text-xs px-3 py-1 bg-surface-container rounded-full text-on-surface-variant font-mono">
                              {selectedDoc.category || '일반 지식'}
                            </span>
                          ) : (
                            <span className="text-xs px-3 py-1 bg-primary/10 rounded-full text-primary font-mono animate-pulse">
                              Generating...
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Booklet or Scroll Content */}
                      {isReportBooklet ? (
                        <div className={`flex-1 flex relative overflow-hidden rounded-2xl border border-outline-variant/30 shadow-md min-h-[600px] h-[78vh] ${reportThemeClass}`}>
                          {/* Left Page */}
                          <div className={`flex-1 overflow-y-auto p-8 md:p-12 markdown-body serif-article ${reportFontSizeClass} ${reportDisplayIndex === 0 && reportPages[reportDisplayIndex] ? 'first-page drop-cap' : ''} book-page-shadow-left`}>
                            {reportPages[reportDisplayIndex] ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{preprocessMarkdown(reportPages[reportDisplayIndex])}</ReactMarkdown>
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            )}
                            <div className="mt-8 text-xs opacity-50 text-center font-semibold select-none border-t border-outline-variant/10 pt-4">{reportDisplayIndex + 1} / {reportPages.length}</div>
                          </div>
                          
                          {isReportDoublePage && <div className="book-spine" />}
                          
                          {/* Right Page */}
                          {isReportDoublePage && (
                            <div className={`flex-1 overflow-y-auto p-8 md:p-12 markdown-body serif-article ${reportFontSizeClass} book-page-shadow-right border-l border-outline-variant/10`}>
                              {reportPages[reportDisplayIndex + 1] ? (
                                <>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{preprocessMarkdown(reportPages[reportDisplayIndex + 1])}</ReactMarkdown>
                                  <div className="mt-8 text-xs opacity-50 text-center font-semibold select-none border-t border-outline-variant/10 pt-4">{reportDisplayIndex + 2} / {reportPages.length}</div>
                                </>
                              ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-sm font-semibold select-none">
                                  <BookOpen size={24} className="mb-2 opacity-50 text-primary" />마지막 페이지
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Navigation Buttons */}
                          <button onClick={handleReportPrev} disabled={reportDisplayIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 booklet-nav-btn disabled:opacity-0 disabled:pointer-events-none transition-all duration-300" title="이전 페이지 (←)"><ChevronLeft size={20} /></button>
                          <button onClick={handleReportNext} disabled={isReportDoublePage ? reportDisplayIndex + 2 >= reportPages.length : reportDisplayIndex + 1 >= reportPages.length} className="absolute right-4 top-1/2 -translate-y-1/2 booklet-nav-btn disabled:opacity-0 disabled:pointer-events-none transition-all duration-300" title="다음 페이지 (→)"><ChevronRight size={20} /></button>
                        </div>
                      ) : (
                        <div className="markdown-body text-on-background bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/20 shadow-sm max-w-4xl mx-auto w-full overflow-y-auto">
                          {reportContent ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                              {preprocessMarkdown(reportContent)}
                            </ReactMarkdown>
                          ) : (
                            <div className="flex h-32 items-center justify-center">
                              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <BookOpen size={48} className="text-outline/50 mb-4 animate-bounce" />
                    <h3 className="text-lg font-bold text-on-background">지식 위키 뷰어</h3>
                    <p className="text-xs text-on-surface-variant max-w-sm mt-1">
                      왼쪽 리스트에서 기업 실적 리포트 또는 거시경제 문서를 선택하여 검토하거나, 우측 챗봇에 질문해 지식을 증강해보세요.
                    </p>
                    <div className="mt-6 flex gap-3">
                      <button 
                        onClick={() => handleSearchChange('RAG')} 
                        className="px-4 py-2 border border-outline-variant/40 rounded-xl text-xs hover:border-primary flex items-center gap-1.5 transition-all bg-surface-container-lowest"
                      >
                        <Lightbulb size={14} className="text-amber-500" />
                        <span>RAG 개념 검색</span>
                      </button>
                      <button 
                        onClick={() => handleSearchChange('거대언어모델')} 
                        className="px-4 py-2 border border-outline-variant/40 rounded-xl text-xs hover:border-primary flex items-center gap-1.5 transition-all bg-surface-container-lowest"
                      >
                        <Cpu size={14} className="text-purple-500" />
                        <span>LLM 핵심 위키</span>
                      </button>
                    </div>
                  </div>
                )}
              </main>
            </div>
          )}

          {/* TAB 2: INTERACTIVE KNOWLEDGE GRAPH */}
          {activeTab === 'graph' && (
            <Interactive3DGraph 
              documents={documents} 
              onSelectNode={selectDocument} 
              showDocumentPopup={showDocumentPopup}
            />
          )}
        </div>
      </div>

      {/* 3. Floating/Minimized Chat Panel (Bottom Right) - Scale-down on Focus Mode */}
      <div 
        id="floating-chat"
        ref={chatRef}
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px)`,
          width: isChatOpen ? `${chatSize.width}px` : '56px',
          height: isChatOpen ? `${chatSize.height}px` : '56px'
        }}
        className={`fixed bottom-6 right-6 flex flex-col z-50 ${
          isFocusMode ? 'scale-0 opacity-0 pointer-events-none' : ''
        } ${
          isResizing ? '' : 'transition-all duration-300'
        }`}
      >
        {isChatOpen ? (
          renderChatPanelContent(false)
        ) : (
          <button 
            onMouseDown={handleMouseDown}
            onClick={() => {
              if (!hasDragged.current) {
                setIsChatOpen(true);
              }
            }}
            className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-move select-none"
          >
            <MessageSquare size={24} className="pointer-events-none animate-pulse" />
          </button>
        )}
      </div>
      
      {/* Document Detail Popup Modal */}
      {isPopupOpen && popupDoc && (() => {
        const pages = parseMarkdownToPages(popupContent);
        const isBooklet = bookletMode === 'booklet';
        
        const currentPageClamped = Math.max(0, Math.min(bookletCurrentPage, pages.length - 1));
        const displayIndex = currentPageClamped;

        const themeClass = bookletTheme === 'sepia'
          ? 'theme-paper-sepia'
          : bookletTheme === 'white'
            ? 'theme-paper-white'
            : 'theme-paper-dark';

        const fontSizeClass = bookletFontSize === 'sm'
          ? 'text-sm'
          : bookletFontSize === 'lg'
            ? 'text-lg'
            : bookletFontSize === 'xl'
              ? 'text-xl'
              : 'text-base';

        const handlePrev = () => {
          setBookletCurrentPage(prev => Math.max(0, prev - 1));
        };

        const handleNext = () => {
          setBookletCurrentPage(prev => Math.min(pages.length - 1, prev + 1));
        };

        return (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsPopupOpen(false);
                setPopupDoc(null);
                setPopupContent('');
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191816]/75 backdrop-blur-md transition-opacity animate-in fade-in duration-200 cursor-pointer"
          >
            <div className="bg-surface-container border border-outline-variant/30 rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 transition-all max-h-[92vh] h-[92vh] max-w-[95vw] cursor-default">
              {/* Modal Header */}
              <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low shrink-0 select-none">
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-1.5 text-xs text-outline mb-1 font-semibold">
                    <BookOpen size={12} className="text-primary" />
                    <span>{popupDoc.folder} (팝업 1면 보기)</span>
                  </div>
                  <h3 className="text-base md:text-lg font-bold text-on-background truncate">{popupDoc.title}</h3>
                </div>
                <div className="flex items-center shrink-0">
                  {isBooklet && (
                    <div className="flex items-center gap-1.5 border-r border-outline-variant/30 pr-3 mr-3">
                      <button onClick={() => setBookletTheme('sepia')} className={`w-5 h-5 rounded-full bg-[#f3ece0] border transition-all ${bookletTheme === 'sepia' ? 'ring-2 ring-primary border-white scale-110 shadow-sm' : 'border-outline-variant/40 hover:scale-105'}`} title="세피아 미색지" />
                      <button onClick={() => setBookletTheme('white')} className={`w-5 h-5 rounded-full bg-[#faf9f6] border transition-all ${bookletTheme === 'white' ? 'ring-2 ring-primary border-slate-300 scale-110 shadow-sm' : 'border-outline-variant/40 hover:scale-105'}`} title="백색지" />
                      <button onClick={() => setBookletTheme('dark')} className={`w-5 h-5 rounded-full bg-[#1e1b18] border transition-all ${bookletTheme === 'dark' ? 'ring-2 ring-primary border-slate-600 scale-110 shadow-sm' : 'border-outline-variant/40 hover:scale-105'}`} title="다크 매거진" />
                    </div>
                  )}
                  {isBooklet && (
                    <div className="flex items-center gap-1 border-r border-outline-variant/30 pr-3 mr-3">
                      <button onClick={() => { if (bookletFontSize === 'xl') setBookletFontSize('lg'); else if (bookletFontSize === 'lg') setBookletFontSize('base'); else if (bookletFontSize === 'base') setBookletFontSize('sm'); }} disabled={bookletFontSize === 'sm'} className="w-6 h-6 flex items-center justify-center border border-outline-variant/50 rounded hover:bg-outline-variant/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold text-on-background transition-colors" title="글자 크기 축소">A-</button>
                      <span className="w-10 text-center text-[10px] text-outline font-bold uppercase select-none">{bookletFontSize}</span>
                      <button onClick={() => { if (bookletFontSize === 'sm') setBookletFontSize('base'); else if (bookletFontSize === 'base') setBookletFontSize('lg'); else if (bookletFontSize === 'lg') setBookletFontSize('xl'); }} disabled={bookletFontSize === 'xl'} className="w-6 h-6 flex items-center justify-center border border-outline-variant/50 rounded hover:bg-outline-variant/10 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold text-on-background transition-colors" title="글자 크기 확대">A+</button>
                    </div>
                  )}
                  <button onClick={() => setBookletMode(bookletMode === 'booklet' ? 'scroll' : 'booklet')} className={`p-1.5 rounded-lg transition-colors border mr-3 ${bookletMode === 'booklet' ? 'bg-primary text-on-primary border-primary' : 'bg-transparent text-outline border-outline-variant/50 hover:bg-outline-variant/10 hover:text-on-background'}`} title={bookletMode === 'booklet' ? '종스크롤 아티클 모드로 변경' : '책자 넘김 매거진 모드로 변경'}>
                    {bookletMode === 'booklet' ? <BookOpen size={16} /> : <FileText size={16} />}
                  </button>
                  <button onClick={() => { setIsPopupOpen(false); setPopupDoc(null); setPopupContent(''); }} className="p-1.5 hover:bg-outline-variant/20 rounded-full transition-colors text-outline hover:text-on-background">
                    <X size={18} />
                  </button>
                </div>
              </div>
              
              {/* Modal Content */}
              {isBooklet ? (
                <div className={`flex-1 flex relative overflow-hidden ${themeClass}`}>
                  <div className={`flex-1 overflow-y-auto p-8 md:p-12 markdown-body serif-article ${fontSizeClass} ${displayIndex === 0 && pages[displayIndex] ? 'first-page drop-cap' : ''} book-page-shadow-left`}>
                    {pages[displayIndex] ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{preprocessMarkdown(pages[displayIndex])}</ReactMarkdown>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    <div className="mt-8 text-xs opacity-50 text-center font-semibold select-none border-t border-outline-variant/10 pt-4">{displayIndex + 1} / {pages.length}</div>
                  </div>
                  <button onClick={handlePrev} disabled={displayIndex === 0} className="absolute left-4 top-1/2 -translate-y-1/2 booklet-nav-btn disabled:opacity-0 disabled:pointer-events-none transition-all duration-300" title="이전 페이지 (←)"><ChevronLeft size={20} /></button>
                  <button onClick={handleNext} disabled={displayIndex + 1 >= pages.length} className="absolute right-4 top-1/2 -translate-y-1/2 booklet-nav-btn disabled:opacity-0 disabled:pointer-events-none transition-all duration-300" title="다음 페이지 (→)"><ChevronRight size={20} /></button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 md:p-10 markdown-body text-on-background bg-surface-container-lowest">
                  <div className="max-w-4xl mx-auto">
                    {popupContent ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{preprocessMarkdown(popupContent)}</ReactMarkdown>
                    ) : (
                      <div className="flex h-32 items-center justify-center">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Search Approval Modal */}
      {searchApprovalRequest && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-surface-container border border-outline/35 rounded-2xl max-w-md w-full shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-primary text-xl font-bold">
              <Globe size={24} className="text-secondary" />
              <span>실시간 웹 검색 요청</span>
            </div>
            
            <p className="text-on-background/80 text-xs leading-relaxed">
              AI가 최신 정보 수집을 위해 실시간 웹 검색(Flashlight Search)을 요청했습니다. 외부 검색을 승인하시겠습니까?
            </p>
            
            <div className="bg-surface-container-low border border-outline/25 p-3 rounded-lg text-xs font-mono break-all text-on-surface-variant max-h-24 overflow-y-auto">
              <strong>검색어:</strong> {searchApprovalRequest.query}
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={() => handleSearchApproval(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-surface-container-lowest border border-outline/30 hover:bg-surface-container-high text-on-background transition-all"
              >
                건너뛰기 (Skip)
              </button>
              <button
                onClick={() => handleSearchApproval(true)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-on-primary hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all"
              >
                승인 (Approve)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Approval Modal (Antigravity 2.0 Plan Mode) */}
      {planApprovalRequest && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-surface-container border border-outline/35 rounded-2xl max-w-md w-full shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-primary text-xl font-bold">
              <Cpu size={24} className="text-secondary animate-pulse" />
              <span>탐색 계획 승인 요청</span>
            </div>
            
            <p className="text-on-background/80 text-xs leading-relaxed">
              사용자님의 리서치 의도를 바탕으로 에이전트가 다음과 같이 다단계 리서치 탐색 계획을 수립했습니다. 이 계획대로 진행할까요? 아니면 수정 요청 사항이 있으신가요?
            </p>
            
            <div className="bg-surface-container-low border border-outline/25 p-3 rounded-lg text-xs text-on-surface-variant max-h-48 overflow-y-auto space-y-1 font-mono">
              <strong className="text-[11px] uppercase tracking-wider text-primary block mb-1">수립된 시퀀스:</strong>
              {planApprovalRequest.planSteps.map((step, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">{idx + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">수정 요청 사항 (선택):</label>
              <textarea
                id="plan-feedback-input"
                placeholder="예: '3단계에서 최근 2분기 실적 표를 추가해줘', '국내 시장만 한정해서 스캔해줘'"
                className="w-full text-xs p-2.5 rounded-lg border border-outline bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary/50 resize-none h-16"
              />
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={async () => {
                  const feedbackVal = document.getElementById('plan-feedback-input')?.value || '';
                  if (!feedbackVal.trim()) {
                    alert("수정 피드백 내용을 입력해 주세요.");
                    return;
                  }
                  try {
                    await fetchWithAuth('/api/chat/approve_plan', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        plan_id: planApprovalRequest.planId,
                        approved: false,
                        feedback: feedbackVal
                      })
                    });
                    setPlanApprovalRequest(null);
                  } catch (err) {
                    console.error('Failed to send plan feedback:', err);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-surface-container-lowest border border-outline/30 hover:bg-surface-container-high text-on-background transition-all"
              >
                수정 요청
              </button>
              <button
                onClick={async () => {
                  try {
                    await fetchWithAuth('/api/chat/approve_plan', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        plan_id: planApprovalRequest.planId,
                        approved: true,
                        feedback: ''
                      })
                    });
                    setPlanApprovalRequest(null);
                  } catch (err) {
                    console.error('Failed to approve plan:', err);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-on-primary hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all"
              >
                계획 확정 및 실행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding step-by-step tooltip guide */}
      <OnboardingGuide />


    </div>
  );
}

export default App;

function Interactive3DGraph({ documents, onSelectNode, showDocumentPopup }) {
  const canvasRef = React.useRef(null);
  const requestRef = React.useRef(null);
  
  const FOLDER_DISPLAY_NAMES = {
    'knowledge/macro': '거시경제 (Macro)',
    'knowledge/tech_themes': '기술테마 (Tech Themes)',
    'knowledge/industries': '산업 (Industries)',
    'knowledge/segments': '세부 부문 (Segments)',
    'knowledge/institutions': '기관/기업 (Institutions)',
    'knowledge/people': '인물 (People)',
    'knowledge/drafts': '초안 (Drafts)',
    'knowledge/USA': '미국 시장 (USA)',
    'knowledge': '지식 위키 (Knowledge)',
    'llmwiki chat': '결정화 대화 (Chat Log)',
    'guru report': '구루 보고서',
    'macro report': '매크로 보고서',
    'tech trend': '기술 트렌드',
    'startup report': '스타트업 보고서',
    'monthly_magazines': '월간 매거진',
    'snp500 report': 'S&P500 보고서'
  };
  
  // React state for collapsible folders
  const [expandedFolders, setExpandedFolders] = React.useState(new Set());
  
  // React state for floating explorer
  const [explorerSize, setExplorerSize] = React.useState({ width: 280, height: 380 });
  const [isExplorerMinimized, setIsExplorerMinimized] = React.useState(false);
  
  // Cache to store node coordinates to prevent resetting positions on collapse/expand
  const nodePositionsRef = React.useRef({});
  const resizingRef = React.useRef(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hoveredInfo, setHoveredInfo] = React.useState(null);
  const fontScaleRef = React.useRef('normal');
  const shouldResetPositionsRef = React.useRef(false);

  // Helper to resolve folder color
  const getFolderColor = (folderName) => {
    const FOLDER_COLORS = {
      'knowledge/macro': '#7ca4ab',
      'knowledge/tech_themes': '#aa91a8',
      'knowledge/industries': '#8ea893',
      'knowledge/segments': '#7ca39a',
      'knowledge/institutions': '#d68b60',
      'knowledge/people': '#d493a3',
      'knowledge/drafts': '#b8b2a8',
      'knowledge/USA': '#728aa0',
      'knowledge': '#aa9885',
      'guru report': '#947aa5',
      'macro report': '#cca662',
      'tech trend': '#6a9fa8',
      'startup report': '#ca8094',
      'monthly_magazines': '#72987a',
      'llmwiki chat': '#d4aa3b',
      'snp500 report': '#8082ba'
    };
    if (FOLDER_COLORS[folderName]) return FOLDER_COLORS[folderName];
    // Check key prefixes (e.g. knowledge/macro/subfolder)
    for (const key of Object.keys(FOLDER_COLORS)) {
      if (folderName && folderName.startsWith(key + '/')) return FOLDER_COLORS[key];
    }
    // Simple string hash to HSL
    let hash = 0;
    for (let i = 0; i < folderName.length; i++) {
      hash = folderName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 75%, 60%)`;
  };

  // Reset graph view state
  const handleResetGraphView = () => {
    nodePositionsRef.current = {};
    setExpandedFolders(new Set());
    stateRef.current.zoom = 1.0;
    stateRef.current.yaw = 0.0;
    stateRef.current.pitch = 0.0;
    stateRef.current.autoRotate = true;
    stateRef.current.nodes = [];
    stateRef.current.links = [];
    setIsLoading(true);
  };

  const stateRef = React.useRef({
    nodes: [],
    links: [],
    yaw: 0,
    pitch: 0,
    zoom: 1.0,
    dragging: false,
    dragStart: { x: 0, y: 0 },
    hoveredNode: null,
    autoRotate: true,
    width: 800,
    height: 600
  });

  // Toggle folder expansion state
  const toggleFolder = (folder) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  // Resize handler for explorer panel
  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: explorerSize.width,
      startHeight: explorerSize.height
    };
    
    const handleMouseMove = (moveEvent) => {
      if (!resizingRef.current) return;
      const dx = moveEvent.clientX - resizingRef.current.startX;
      const dy = moveEvent.clientY - resizingRef.current.startY;
      setExplorerSize({
        width: Math.max(220, resizingRef.current.startWidth + dx),
        height: Math.max(200, resizingRef.current.startHeight + dy)
      });
    };
    
    const handleMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Group documents hierarchically
  const folderTree = React.useMemo(() => {
    const root = { name: 'Root', path: '', children: {}, files: [] };
    
    documents.forEach(doc => {
      const folder = doc.folder || 'other';
      const parts = folder.split('/');
      let current = root;
      
      parts.forEach((part, index) => {
        const currentPath = parts.slice(0, index + 1).join('/');
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            children: {},
            files: []
          };
        }
        current = current.children[part];
      });
      
      current.files.push(doc);
    });
    
    return root;
  }, [documents]);

  const renderFolderTreeNode = (node, depth = 0) => {
    const subfolderKeys = Object.keys(node.children).sort();
    const sortedFiles = [...node.files].sort((a, b) => a.title.localeCompare(b.title));
    
    return (
      <div key={node.path || 'root'} className="space-y-1">
        {subfolderKeys.map(key => {
          const subNode = node.children[key];
          const isOpen = expandedFolders.has(subNode.path);
          const displayName = FOLDER_DISPLAY_NAMES[subNode.path] || subNode.name;
          
          const countAllFiles = (n) => {
            let count = n.files.length;
            Object.keys(n.children).forEach(k => {
              count += countAllFiles(n.children[k]);
            });
            return count;
          };
          const totalFilesCount = countAllFiles(subNode);

          return (
            <div key={subNode.path} className="space-y-1">
              <div 
                onClick={() => toggleFolder(subNode.path)}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-surface-container-high text-on-surface font-semibold transition-all"
                style={{ paddingLeft: `${Math.max(10, depth * 12 + 10)}px` }}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <ChevronRight 
                    size={12} 
                    className={`transition-transform duration-200 text-outline shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                  />
                  <span className="material-symbols-outlined text-[16px] text-amber-500 shrink-0">
                    {isOpen ? 'folder_open' : 'folder'}
                  </span>
                  <span className="truncate">{displayName}</span>
                </div>
                <span className="text-[9px] text-outline font-mono bg-surface-container-highest px-1.5 py-0.5 rounded-full shrink-0">
                  {totalFilesCount}
                </span>
              </div>
              
              {isOpen && renderFolderTreeNode(subNode, depth + 1)}
            </div>
          );
        })}
        
        {sortedFiles.map(doc => (
          <div 
            key={doc.path}
            onClick={() => showDocumentPopup(doc.title)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] cursor-pointer hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-all truncate"
            style={{ paddingLeft: `${Math.max(26, depth * 12 + 26)}px` }}
          >
            <FileText size={11} className="shrink-0 text-primary/70" />
            <span className="truncate">{doc.title}</span>
          </div>
        ))}
      </div>
    );
  };

  // Initialize and update nodes/links dynamically
  React.useEffect(() => {
    if (!documents || documents.length === 0) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    // 1. Cache current coordinates of nodes
    const state = stateRef.current;
    state.nodes.forEach(n => {
      nodePositionsRef.current[n.id] = { x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz };
    });

    // Helper to check if a folder path is visible based on parent expansion states
    const isFolderVisible = (folderPath) => {
      if (!folderPath || folderPath === 'other') return true;
      const parts = folderPath.split('/');
      if (parts.length === 1) return true; // root folders are always visible
      const parentPath = parts.slice(0, -1).join('/');
      return expandedFolders.has(parentPath) && isFolderVisible(parentPath);
    };

    // 2. Extract unique folder paths including all parent prefixes
    const allFolderPathsSet = new Set();
    documents.forEach(d => {
      const folder = d.folder || 'other';
      const parts = folder.split('/');
      for (let i = 1; i <= parts.length; i++) {
        allFolderPathsSet.add(parts.slice(0, i).join('/'));
      }
    });
    const allFolderPaths = Array.from(allFolderPathsSet);

    // Filter folder paths that are currently visible
    const visibleFolderPaths = allFolderPaths.filter(p => isFolderVisible(p));

    // 3. Create folder nodes
    const folderNodes = visibleFolderPaths.map((folderPath, index) => {
      const id = `folder-${folderPath}`;
      let x = 0, y = 0, z = 0;
      let vx = 0, vy = 0, vz = 0;
      
      const parts = folderPath.split('/');
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;

      if (nodePositionsRef.current[id]) {
        x = nodePositionsRef.current[id].x;
        y = nodePositionsRef.current[id].y;
        z = nodePositionsRef.current[id].z;
        vx = nodePositionsRef.current[id].vx;
        vy = nodePositionsRef.current[id].vy;
        vz = nodePositionsRef.current[id].vz;
      } else {
        const parentId = parentPath ? `folder-${parentPath}` : null;
        if (parentId && nodePositionsRef.current[parentId]) {
          const px = nodePositionsRef.current[parentId].x;
          const py = nodePositionsRef.current[parentId].y;
          const pz = nodePositionsRef.current[parentId].z;
          x = px + (Math.random() - 0.5) * 60;
          y = py + (Math.random() - 0.5) * 60;
          z = pz + (Math.random() - 0.5) * 60;
        } else {
          const theta = (index / visibleFolderPaths.length) * 2 * Math.PI;
          const r = 180;
          x = r * Math.cos(theta);
          y = r * Math.sin(theta);
          z = (Math.random() - 0.5) * 80;
        }
      }
      
      const title = FOLDER_DISPLAY_NAMES[folderPath] || parts[parts.length - 1];
      const immediateFiles = documents.filter(d => (d.folder || 'other') === folderPath);
      
      return {
        id,
        title,
        isFolder: true,
        folder: folderPath,
        parentFolder: parentPath,
        fileCount: immediateFiles.length,
        x, y, z, vx, vy, vz,
        screenX: 0, screenY: 0, depth: 0, projectedScale: 1.0
      };
    });

    // 4. Create active file nodes (only if folder is visible and expanded)
    const fileNodes = [];
    documents.forEach(doc => {
      const docFolder = doc.folder || 'other';
      if (isFolderVisible(docFolder) && expandedFolders.has(docFolder)) {
        const id = doc.path;
        let x = 0, y = 0, z = 0;
        let vx = 0, vy = 0, vz = 0;
        
        if (nodePositionsRef.current[id]) {
          x = nodePositionsRef.current[id].x;
          y = nodePositionsRef.current[id].y;
          z = nodePositionsRef.current[id].z;
          vx = nodePositionsRef.current[id].vx;
          vy = nodePositionsRef.current[id].vy;
          vz = nodePositionsRef.current[id].vz;
        } else {
          // Spawn near parent folder node
          const parentFolderNode = folderNodes.find(f => f.folder === docFolder);
          const px = parentFolderNode ? parentFolderNode.x : 0;
          const py = parentFolderNode ? parentFolderNode.y : 0;
          const pz = parentFolderNode ? parentFolderNode.z : 0;
          
          x = px + (Math.random() - 0.5) * 40;
          y = py + (Math.random() - 0.5) * 40;
          z = pz + (Math.random() - 0.5) * 40;
        }
        
        const existingCountInFolder = fileNodes.filter(n => n.folder === docFolder).length;
        if (existingCountInFolder < 50) {
          fileNodes.push({
            id,
            title: doc.title,
            folder: docFolder,
            isFolder: false,
            docRef: doc,
            x, y, z, vx, vy, vz,
            screenX: 0, screenY: 0, depth: 0, projectedScale: 1.0
          });
        }
      }
    });

    const activeNodes = [...folderNodes, ...fileNodes];

    // 5. Create links
    const activeLinks = [];
    
    // Link subfolders to their parent folders
    folderNodes.forEach(fNode => {
      if (fNode.parentFolder) {
        const parentNode = folderNodes.find(p => p.folder === fNode.parentFolder);
        if (parentNode) {
          activeLinks.push({
            source: parentNode,
            target: fNode,
            id: `link-subfolder-${fNode.parentFolder}-${fNode.folder}`
          });
        }
      }
    });
    
    // Link files to parent folder nodes
    fileNodes.forEach(fileNode => {
      const parentFolderNode = folderNodes.find(f => f.folder === fileNode.folder);
      if (parentFolderNode) {
        activeLinks.push({
          source: parentFolderNode,
          target: fileNode,
          id: `link-folder-${fileNode.folder}-${fileNode.id}`
        });
      }
    });

    // Link file-to-file wiki links (only if both are active)
    documents.forEach(docA => {
      const docAFolder = docA.folder || 'other';
      if (!isFolderVisible(docAFolder) || !expandedFolders.has(docAFolder)) return;
      
      const sourceNode = fileNodes.find(n => n.id === docA.path);
      if (!sourceNode) return;

      const docALinks = docA.links || [];
      docALinks.forEach(linkedTitle => {
        const targetDoc = documents.find(d => 
          d.title.toLowerCase() === linkedTitle.toLowerCase()
        );
        if (targetDoc) {
          const targetDocFolder = targetDoc.folder || 'other';
          if (!isFolderVisible(targetDocFolder) || !expandedFolders.has(targetDocFolder)) return;
          
          const targetNode = fileNodes.find(n => n.id === targetDoc.path);
          if (targetNode && sourceNode.id !== targetNode.id) {
            // Avoid duplicate links
            const exists = activeLinks.some(l => 
              (l.source.id === sourceNode.id && l.target.id === targetNode.id) ||
              (l.source.id === targetNode.id && l.target.id === sourceNode.id)
            );
            if (!exists) {
              activeLinks.push({
                source: sourceNode,
                target: targetNode,
                id: `link-${sourceNode.id}-${targetNode.id}`
              });
            }
          }
        }
      });
    });

    stateRef.current.nodes = activeNodes;
    stateRef.current.links = activeLinks;

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [documents, expandedFolders]);

  // Main Draw & Physics loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      const w = parent.clientWidth || 800;
      const h = parent.clientHeight || 600;
      canvas.width = w;
      canvas.height = h;
      stateRef.current.width = w;
      stateRef.current.height = h;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const updateAndDraw = () => {
      const state = stateRef.current;
      const { nodes, links, width, height } = state;

      // 1. Force-directed physics
      if (nodes.length > 0) {
        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].isAnchor) continue;
          for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[j].isAnchor) continue;
            const na = nodes[i];
            const nb = nodes[j];
            const dx = nb.x - na.x;
            const dy = nb.y - na.y;
            const dz = nb.z - na.z;
            const distSq = dx*dx + dy*dy + dz*dz + 40.0;
            const dist = Math.sqrt(distSq);
            
            // Adjust repulsion distance based on whether it is folder/file
            const minRepel = (na.isFolder || nb.isFolder) ? 220 : 120;
            if (dist < minRepel) {
              const rawForce = (na.isFolder || nb.isFolder) ? 250 / distSq : 120 / distSq;
              const force = Math.min(rawForce, 15);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              const fz = (dz / dist) * force;
              
              if (!isNaN(fx) && !isNaN(fy) && !isNaN(fz)) {
                na.vx -= fx; na.vy -= fy; na.vz -= fz;
                nb.vx += fx; nb.vy += fy; nb.vz += fz;
              }
            }
          }
        }

        // Attraction
        links.forEach(link => {
          const na = link.source;
          const nb = link.target;
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dz = nb.z - na.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
          
          const isFolderLink = na.isFolder || nb.isFolder;
          const k = isFolderLink ? 0.015 : 0.008; // pull files closer to parent folders
          const restLength = isFolderLink ? 80 : 120;
          
          const force = (dist - restLength) * k;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          
          if (!isNaN(fx) && !isNaN(fy) && !isNaN(fz)) {
            na.vx += fx; na.vy += fy; na.vz += fz;
            nb.vx -= fx; nb.vy -= fy; nb.vz -= fz;
          }
        });

        // Center gravity - increased strength for active centering and responsive snapping
        nodes.forEach(n => {
          const gravity = n.isFolder ? 0.003 : 0.005;
          n.vx -= n.x * gravity;
          n.vy -= n.y * gravity;
          n.vz -= n.z * gravity;
        });

        // Apply velocity
        nodes.forEach(n => {
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.vz *= 0.85;
          
          // Speed limit to prevent flying away/crashing
          const speed = Math.sqrt(n.vx*n.vx + n.vy*n.vy + n.vz*n.vz);
          const maxSpeed = 10.0;
          if (speed > maxSpeed) {
            n.vx = (n.vx / speed) * maxSpeed;
            n.vy = (n.vy / speed) * maxSpeed;
            n.vz = (n.vz / speed) * maxSpeed;
          }
          
          n.x += n.vx;
          n.y += n.vy;
          n.z += n.vz;
          
          // Safeguard: Check for NaN
          if (isNaN(n.x) || isNaN(n.y) || isNaN(n.z)) {
            n.x = Math.random() * 100 - 50;
            n.y = Math.random() * 100 - 50;
            n.z = Math.random() * 100 - 50;
            n.vx = 0; n.vy = 0; n.vz = 0;
          }
        });
      }

      // 2. Auto Rotation
      if (state.autoRotate && !state.dragging) {
        state.yaw += 0.0015;
      }

      // 3. Perspective Projection
      const sinY = Math.sin(state.yaw);
      const cosY = Math.cos(state.yaw);
      const sinP = Math.sin(state.pitch);
      const cosP = Math.cos(state.pitch);

      nodes.forEach(n => {
        let x1 = n.x * cosY - n.z * sinY;
        let z1 = n.x * sinY + n.z * cosY;
        let y2 = n.y * cosP - z1 * sinP;
        let z2 = n.y * sinP + z1 * cosP;

        const cameraDist = 700;
        
        // Prevent z2 from causing divide by zero or negative scale
        const denominator = cameraDist + z2;
        const scale = cameraDist / (denominator < 50 ? 50 : denominator);
        
        n.screenX = width / 2 + x1 * scale * state.zoom;
        n.screenY = height / 2 + y2 * scale * state.zoom;
        n.depth = z2;
        n.projectedScale = scale;
        
        // Clamp screen coordinates to avoid drawing extreme values
        if (isNaN(n.screenX) || isNaN(n.screenY)) {
          n.screenX = width / 2;
          n.screenY = height / 2;
        }
      });

      // 4. Drawing
      ctx.clearRect(0, 0, width, height);

      const bodyStyle = getComputedStyle(document.body);
      const primaryColor = bodyStyle.getPropertyValue('--color-primary').trim() || '#3b82f6';
      const secondaryColor = bodyStyle.getPropertyValue('--color-secondary').trim() || '#a855f7';
      const outlineColor = bodyStyle.getPropertyValue('--color-outline-variant').trim() || '#444';
      const textColor = bodyStyle.getPropertyValue('--color-on-background').trim() || '#fff';

      const sortedNodes = [...nodes].sort((a, b) => b.depth - a.depth);
      
      const scaleMap = {
        small: 0.85,
        normal: 1.0,
        large: 1.15,
        huge: 1.30
      };
      const fontScaleVar = scaleMap[fontScaleRef.current] || 1.0;

      // Draw Links (Skip layout-only links to keep clean graph)
      links.forEach(link => {
        if (link.isLayoutOnly) return;
        const na = link.source;
        const nb = link.target;

        const avgDepth = (na.depth + nb.depth) / 2;
        const maxDepth = 400;
        const opacity = Math.max(0.02, 1 - (avgDepth + 200) / maxDepth);

        ctx.beginPath();
        ctx.moveTo(na.screenX, na.screenY);
        ctx.lineTo(nb.screenX, nb.screenY);
        
        // Folder links are dotted/subtle, wiki-links are solid
        const isFolderLink = na.isFolder || nb.isFolder;
        ctx.strokeStyle = isFolderLink ? 'rgba(234, 179, 8, 0.4)' : outlineColor;
        ctx.lineWidth = isFolderLink ? 0.8 : 1.2;
        ctx.setLineDash(isFolderLink ? [3, 3] : []);
        
        ctx.globalAlpha = opacity * 0.35;
        ctx.stroke();
        ctx.setLineDash([]); // Reset
        ctx.globalAlpha = 1.0;
      });

      // Draw Nodes
      sortedNodes.forEach(n => {
        const baseSize = n.isFolder ? 8 : 4;
        const size = Math.max(2.5, baseSize * n.projectedScale * state.zoom);
        const maxDepth = 400;
        const opacity = Math.max(0.1, 1 - (n.depth + 200) / maxDepth);

        const isHovered = state.hoveredNode && state.hoveredNode.id === n.id;
        

        // Node folder coloring
        let color = primaryColor;
        if (n.isFolder) {
          color = getFolderColor(n.title);
        } else {
          color = getFolderColor(n.folder);
        }
        
        // 1) Outer soft radial glow
        ctx.beginPath();
        ctx.arc(n.screenX, n.screenY, size * (n.isCluster ? 1.8 : 2.5), 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(n.screenX, n.screenY, 0, n.screenX, n.screenY, size * (n.isCluster ? 1.8 : 2.5));
        grad.addColorStop(0, color);
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = opacity * 0.55;
        ctx.fill();

        // 2) Node center core
        ctx.beginPath();
        ctx.arc(n.screenX, n.screenY, size * 0.7, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = isHovered ? 1.0 : opacity;
        ctx.fill();
        
        // Draw cluster folder border overlay
        if (n.isCluster) {
          ctx.beginPath();
          ctx.arc(n.screenX, n.screenY, size * 0.9, 0, 2 * Math.PI);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.globalAlpha = opacity * 0.8;
          ctx.stroke();
        }
        
        ctx.globalAlpha = 1.0;

        // Confidence warning rings for files containing [UNVERIFIED] or [AMBIGUOUS]
        const isUnverified = !n.isFolder && n.docRef && n.docRef.content && n.docRef.content.includes('[UNVERIFIED]');
        const isAmbiguous = !n.isFolder && n.docRef && n.docRef.content && n.docRef.content.includes('[AMBIGUOUS]');
        
        if (isUnverified) {
          const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
          ctx.beginPath();
          ctx.arc(n.screenX, n.screenY, size * 2.0, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + pulse * 0.6 * opacity})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (isAmbiguous) {
          const pulse = (Math.sin(Date.now() / 250) + 1) / 2;
          ctx.beginPath();
          ctx.arc(n.screenX, n.screenY, size * 1.8, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(249, 115, 22, ${0.4 + pulse * 0.5 * opacity})`;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([1, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Label drawing
        if (isHovered || opacity > 0.45 || nodes.length < 30 || n.isFolder) {
          ctx.font = isHovered ? 'bold 11px sans-serif' : '9px sans-serif';
          
          let text = n.title;
          if (n.isFolder) {
            const displayName = FOLDER_DISPLAY_NAMES[n.title] || n.title;
            text = `📁 ${displayName} (${n.fileCount})`;
          }
          
          if (text.length > 22) text = `${text.substring(0, 22)}...`;
          const textWidth = ctx.measureText(text).width;

          ctx.save();
          ctx.globalAlpha = isHovered ? 1.0 : (n.isFolder ? opacity * 0.95 : opacity * 0.75);

          if (isHovered || n.isFolder) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            const rectW = textWidth + 12;
            const rectH = 18;
            const rx = n.screenX - rectW / 2;
            const ry = n.screenY - size - rectH - 6;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rectW, rectH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = n.isFolder ? '#fef08a' : '#fff';
            ctx.fillText(text, rx + 6, ry + 12);
          } else {
            ctx.fillStyle = textColor;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 3;
            ctx.textAlign = 'center';
            ctx.fillText(text, n.screenX, n.screenY + size + 12);
          }
          ctx.restore();
        }
      });

      requestRef.current = requestAnimationFrame(updateAndDraw);
    };

    requestRef.current = requestAnimationFrame(updateAndDraw);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  const handleMouseDown = (e) => {
    const state = stateRef.current;
    state.dragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (state.dragging) {
      const dx = e.clientX - state.dragStart.x;
      const dy = e.clientY - state.dragStart.y;
      state.yaw += dx * 0.005;
      state.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, state.pitch + dy * 0.005));
      state.dragStart = { x: e.clientX, y: e.clientY };
    } else {
      let closest = null;
      let minDist = 25; // larger hover threshold
      state.nodes.forEach(n => {
        if (n.isAnchor) return;
        const dx = n.screenX - mouseX;
        const dy = n.screenY - mouseY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const radius = n.isFolder ? 25 : 15;
        if (dist < radius && dist < minDist) {
          closest = n;
          minDist = dist;
        }
      });
      state.hoveredNode = closest;
      setHoveredInfo(closest ? closest : null);
    }
  };

  const handleMouseUp = () => {
    stateRef.current.dragging = false;
  };

  const handleClick = (e) => {
    const state = stateRef.current;
    if (state.hoveredNode) {
      if (state.hoveredNode.isFolder) {
        toggleFolder(state.hoveredNode.folder);
      } else {
        showDocumentPopup(state.hoveredNode.title);
      }
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const state = stateRef.current;
    if (e.deltaY < 0) {
      state.zoom = Math.min(state.zoom + 0.05, 3.0);
    } else {
      state.zoom = Math.max(state.zoom - 0.05, 0.3);
    }
  };

  const handleZoomIn = () => {
    stateRef.current.zoom = Math.min(stateRef.current.zoom + 0.2, 3.0);
  };

  const handleZoomOut = () => {
    stateRef.current.zoom = Math.max(stateRef.current.zoom - 0.2, 0.3);
  };

  const handleToggleAutoRotate = () => {
    stateRef.current.autoRotate = !stateRef.current.autoRotate;
  };

  const handleResetLayout = () => {
    stateRef.current.yaw = 0;
    stateRef.current.pitch = 0;
    stateRef.current.zoom = 1.0;
    stateRef.current.autoRotate = true;
    shouldResetPositionsRef.current = true;
    setExpandedFolders(new Set(['llmwiki chat']));
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-surface-container-lowest">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container-lowest/80 backdrop-blur-sm z-20 transition-all duration-500">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4" />
          <p className="text-sm font-bold text-on-surface animate-pulse">지식 그래프 시뮬레이션을 준비하고 있습니다...</p>
          <p className="text-[11px] text-outline mt-1">지식 노드 매핑 및 3차원 위치 계산 중</p>
        </div>
      )}
      
      {/* Visual Guideline Hint overlay */}
      <div className="absolute top-6 left-6 p-3 rounded-xl glass border border-outline-variant/30 text-[10px] text-on-surface-variant max-w-xs space-y-1 pointer-events-none select-none z-10">
        <div className="font-bold text-primary text-[11px] mb-1">💡 지식 그래프 꿀팁</div>
        <p>• **드래그**: 3D 공간 회전</p>
        <p>• **마우스 휠**: 그래프 줌인/줌아웃</p>
        <p>• **📁 클러스터 클릭**: 하위 노드 펼치기 / 접기</p>
        <p>• **문서 노드 클릭**: 우측 에디터에서 해당 문서 읽기</p>
      </div>

      {/* 3D Controls overlay */}
      <div className="absolute bottom-6 left-6 flex gap-2 z-10">
        <button 
          onClick={handleZoomIn}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg hover:bg-surface transition-all text-on-surface"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button 
          onClick={handleZoomOut}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg hover:bg-surface transition-all text-on-surface"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button 
          onClick={handleResetGraphView}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg transition-all text-on-surface hover:bg-surface"
          title="지식 그래프 초기화"
        >
          <RefreshCw size={18} />
        </button>
        <button 
          onClick={handleToggleAutoRotate}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg transition-all text-on-surface hover:bg-surface"
          title="자동 회전 토글"
        >
          <RotateCw size={18} />
        </button>
      </div>

      {/* Floating Category Legend Panel */}
      <div className="absolute top-6 right-6 z-20 bg-surface/75 border border-outline-variant/30 backdrop-blur-lg rounded-2xl shadow-2xl p-4 flex flex-col gap-2.5 max-w-[240px] select-none">
        <div className="flex items-center gap-1.5 border-b border-outline-variant/30 pb-2 shrink-0">
          <span className="material-symbols-outlined text-[18px] text-primary">palette</span>
          <span className="font-bold text-xs text-on-surface">온톨로지 범례 (Legend)</span>
        </div>
        <div className="space-y-1.5 text-[10px] text-on-surface-variant max-h-[280px] overflow-y-auto pr-1">
          {[
            { label: '거시경제 (Macro)', color: '#7ca4ab' },
            { label: '기술테마 (Tech Themes)', color: '#aa91a8' },
            { label: '산업 (Industries)', color: '#8ea893' },
            { label: '세부 부문 (Segments)', color: '#7ca39a' },
            { label: '기관/기업 (Institutions)', color: '#d68b60' },
            { label: '인물 (People)', color: '#d493a3' },
            { label: '초안 (Drafts)', color: '#b8b2a8' },
            { label: '미국 시장 (USA)', color: '#728aa0' },
            { label: '결정화 대화 (Chat)', color: '#d4aa3b' },
            { label: '기타 분석 보고서', color: '#8082ba' }
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-outline-variant/30 pt-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-red-500 shrink-0 animate-pulse" />
            <span className="text-[9px] text-red-400 font-semibold">[UNVERIFIED] 미검증 경고</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-dotted border-orange-400 shrink-0" />
            <span className="text-[9px] text-orange-400 font-semibold">[AMBIGUOUS] 모호함 경고</span>
          </div>
        </div>
      </div>

      {/* Floating File Explorer Panel */}
      {isExplorerMinimized ? (
        <button 
          onClick={() => setIsExplorerMinimized(false)}
          className="absolute top-6 left-6 z-20 w-10 h-10 rounded-xl glass border border-primary/30 flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all text-primary hover:bg-surface-container"
          title="지식 탐색기 열기"
        >
          <span className="material-symbols-outlined text-[20px]">account_tree</span>
        </button>
      ) : (
        <div 
          style={{ width: `${explorerSize.width}px`, height: `${explorerSize.height}px` }}
          className="absolute top-6 left-6 z-20 bg-surface/75 border border-outline-variant/30 backdrop-blur-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Panel Header */}
          <div className="p-3 bg-surface-container border-b border-outline-variant/30 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">account_tree</span>
              <span className="font-bold text-xs text-on-surface">지식 탐색 트리 (Explorer)</span>
            </div>
            <button 
              onClick={() => setIsExplorerMinimized(true)}
              className="p-1 hover:bg-outline-variant/30 rounded text-outline hover:text-on-surface transition-colors"
              title="최소화"
            >
              <Minimize2 size={14} />
            </button>
          </div>

          {/* Panel Body (Tree Structure) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 select-none font-sans">
            {renderFolderTreeNode(folderTree)}
          </div>

          {/* Resize Handle at Bottom-Right */}
          <div 
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5"
            style={{ zIndex: 10 }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" className="text-outline/40 fill-current">
              <path d="M10,0 L10,10 L0,10 Z M6,10 L10,10 L10,6 Z M2,10 L10,10 L10,2 Z" />
            </svg>
          </div>
        </div>
      )}

      {hoveredInfo && (
        <div className="absolute top-6 right-6 p-4 rounded-xl glass border border-outline-variant/50 max-w-xs shadow-2xl pointer-events-none select-none z-10 animate-fade-in text-xs space-y-1.5">
          <div className="font-bold text-on-surface text-[13px]">
            {hoveredInfo.isFolder ? `📁 폴더: ${hoveredInfo.title}` : hoveredInfo.title}
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] uppercase font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">
              {hoveredInfo.isFolder ? 'Folder' : hoveredInfo.folder}
            </span>
            {!hoveredInfo.isFolder && hoveredInfo.category && (
              <span className="text-[10px] uppercase font-semibold text-secondary px-1.5 py-0.5 rounded bg-secondary/10">
                {hoveredInfo.category}
              </span>
            )}
            {hoveredInfo.isFolder && (
              <span className="text-[10px] uppercase font-semibold text-amber-500 px-1.5 py-0.5 rounded bg-amber-500/10">
                문서 {hoveredInfo.fileCount}개 포함
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


