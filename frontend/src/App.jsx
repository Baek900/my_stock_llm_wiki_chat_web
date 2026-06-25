import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Search, BookOpen, MessageSquare, ShieldAlert, Cpu, 
  ChevronRight, RefreshCw, Sun, Moon, ArrowRight, Check, X,
  FileText, Globe, Lightbulb, Network, ZoomIn, ZoomOut, Maximize2, Minimize2, Eye, Type
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
  const [activeTab, setActiveTab] = useState('explorer'); // 'explorer' | 'graph'
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docContent, setDocContent] = useState('');
  const [currentReportResponse, setCurrentReportResponse] = useState('');
  const [modelMode, setModelMode] = useState('local');
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
    // Process [[wiki]] links to #/wiki/target
    let processed = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, p1, p2) => {
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
        const res = await fetch(`http://127.0.0.1:8080/api/documents?query=${encodeURIComponent(cleanTitle)}`);
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
        const res = await fetch(`http://127.0.0.1:8080/api/documents?query=${encodeURIComponent(cleanTitle)}`);
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
        const res = await fetch(`http://127.0.0.1:8080/api/documents/detail?path=${encodeURIComponent(foundDoc.path)}`);
        const data = await res.json();
        setPopupDoc(foundDoc);
        setPopupContent(data.content);
        setIsPopupOpen(true);
        console.log("Successfully opened popup for doc:", foundDoc.title);
      } catch (e) {
        console.error('Failed to fetch doc content for popup:', e);
        alert('문서 내용을 가져오는 데 실패했습니다.');
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

  // Load documents and check resource status on mount
  useEffect(() => {
    fetchDocuments();
    checkResourceStatus();
    const interval = setInterval(checkResourceStatus, 15000);
    return () => clearInterval(interval);
  }, []);

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
      const res = await fetch('http://127.0.0.1:8080/api/status');
      const data = await res.json();
      setResourceStatus(data);
    } catch (e) {
      console.error('Failed to fetch status:', e);
    }
  };

  const fetchDocuments = async (query = '') => {
    try {
      const res = await fetch(`http://127.0.0.1:8080/api/documents?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setDocuments(data);
    } catch (e) {
      console.error('Failed to fetch documents:', e);
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
      const res = await fetch('http://127.0.0.1:8080/api/documents/publish', {
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
    if (doc.path && (doc.path.includes('knowledge/drafts') || doc.path.includes('knowledge\\drafts'))) {
      setActiveDraftPath(doc.path);
    } else {
      setActiveDraftPath(null);
    }
    // Auto switch to explorer view to view document details
    setActiveTab('explorer');
    try {
      const res = await fetch(`http://127.0.0.1:8080/api/documents/detail?path=${encodeURIComponent(doc.path)}`);
      const data = await res.json();
      setDocContent(data.content);
    } catch (e) {
      console.error('Failed to load document content:', e);
      setDocContent('문서를 읽어오는 데 실패했습니다.');
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
      await fetch('http://127.0.0.1:8080/api/documents/clear_drafts', { method: 'POST' });
      fetchDocuments(searchQuery);
    } catch (e) {
      console.error('Failed to clear drafts on new chat:', e);
    }
  };

  const handleSearchApproval = async (approved) => {
    if (!searchApprovalRequest) return;
    try {
      await fetch('http://127.0.0.1:8080/api/chat/approve_search', {
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

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isGenerating) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsGenerating(true);
    setCurrentThoughts([]);
    setCurrentResponse('');
    setCurrentReportResponse('');
    setSelectedDoc(null);
    setMetaImprovement(null);

    // Open chat window if minimized
    setIsChatOpen(true);

    try {
      const statusRes = await fetch('http://127.0.0.1:8080/api/status');
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
      const response = await fetch('http://127.0.0.1:8080/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          query: userMessage, 
          model_mode: modelMode, 
          draft_path: activeDraftPath,
          is_modification_mode: isModificationMode,
          chat_history: chatHistory.map(h => ({ role: h.role, content: h.content }))
        })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';
      let accumulatedResponse = '';
      let accumulatedReport = '';

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
              }
            } catch (e) {
              console.error('Failed to parse event line:', line, e);
            }
          }
        }
      }

      setChatHistory(prev => [...prev, {
        role: 'assistant',
        content: accumulatedResponse || (accumulatedReport ? '보고서 생성이 완료되었습니다. 왼쪽 지식 탐색기에서 확인해 주세요.' : '답변을 완성하지 못했습니다.'),
        thoughts: [] // Delete thoughts from the completed chat history bubble
      }]);
      setCurrentResponse('');
      setCurrentThoughts([]);
      setCurrentReportResponse('');
      setIsGenerating(false);
      
      // Reload document list
      fetchDocuments(searchQuery);
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
      const res = await fetch('http://127.0.0.1:8080/api/improve', {
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

  const inputFontClass = chatSize.width > 700 
    ? 'text-base py-3 px-4.5 max-h-40' 
    : chatSize.width > 500 
      ? 'text-sm py-2.5 px-4 max-h-32' 
      : 'text-xs py-2 px-3.5 max-h-24';
  const buttonSizeClass = chatSize.width > 700
    ? 'w-12 h-12 rounded-2xl'
    : chatSize.width > 500
      ? 'w-10 h-10 rounded-xl'
      : 'w-8 h-8 rounded-xl';
  const messageFontClass = chatSize.width > 700
    ? 'text-base p-5'
    : chatSize.width > 500
      ? 'text-sm p-4'
      : 'text-[13px] p-3.5';

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
            id="sidebar-explorer"
            onClick={() => setActiveTab('explorer')}
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
            onClick={() => setActiveTab('graph')}
            className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${
              activeTab === 'graph' 
                ? 'text-primary border-r-4 border-primary bg-surface-container-low font-bold scale-[0.98]' 
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined mr-3">account_tree</span>
            <span className="text-[14px]">Knowledge Graph</span>
          </button>
        </nav>

        {/* Active Project Info */}
        <div className="px-4 mt-auto shrink-0">
          <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 relative overflow-hidden">
            <p className="text-[9px] font-bold text-on-surface-variant tracking-widest uppercase mb-1">Active Model</p>
            <p className="text-[13px] font-bold text-primary truncate">Gemma 4</p>
            <div className="mt-3 flex items-center justify-between">
              <span className={`w-2.5 h-2.5 rounded-full ${resourceStatus.busy ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
              <span className="text-[10px] text-on-surface-variant font-mono">
                {resourceStatus.busy ? '자원 사용 중 (분석 진행)' : '추론 가용 상태'}
              </span>
            </div>
          </div>
        </div>
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
          
          {/* TAB 1: KNOWLEDGE EXPLORER & VIEWER */}
          {activeTab === 'explorer' && (
            <div className="flex-1 flex h-full overflow-hidden">
              
              {/* Left Pane: Document List */}
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
                
                {selectedDoc ? (
                  <div className="max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto animate-in fade-in duration-300">
                    <div className="mb-6 pb-4 border-b border-outline-variant/30 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-outline mb-1">
                          <BookOpen size={12} />
                          <span>{selectedDoc.folder}</span>
                        </div>
                        <h2 className="text-2xl font-bold text-on-background">{selectedDoc.title}</h2>
                      </div>
                      <div className="flex items-center gap-3">
                        {selectedDoc.path && (selectedDoc.path.includes('knowledge/drafts') || selectedDoc.path.includes('knowledge\\drafts')) && (
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
                        <span className="text-xs px-3 py-1 bg-surface-container rounded-full text-on-surface-variant font-mono">
                          {selectedDoc.category || '일반 지식'}
                        </span>
                      </div>
                    </div>

                    <div className="markdown-body text-on-background">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
                        {preprocessMarkdown(docContent)}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : currentReportResponse ? (
                  <div className="max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
                    <div className="mb-6 pb-4 border-b border-outline-variant/30 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-outline mb-1">
                          <RefreshCw className="animate-spin text-primary" size={12} />
                          <span className="text-primary font-bold">실시간 심층 리서치 보고서 작성 중...</span>
                        </div>
                        <h2 className="text-2xl font-bold text-on-background">AI 리서치 분석 결과</h2>
                      </div>
                      <span className="text-xs px-3 py-1 bg-primary/10 rounded-full text-primary font-mono animate-pulse">
                        Generating...
                      </span>
                    </div>

                    <div className="markdown-body text-on-background">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
                        {preprocessMarkdown(currentReportResponse)}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
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
            <Interactive3DGraph documents={documents} onSelectNode={selectDocument} fontScale={fontScale} />
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
          /* Minimized Window when Open */
          <div className="w-full h-full glass border border-primary/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
            {/* Resizing Handles */}
            <div 
              onMouseDown={(e) => handleResizeMouseDown(e, 'l')}
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 z-50 transition-colors"
              title="너비 조절"
            />
            <div 
              onMouseDown={(e) => handleResizeMouseDown(e, 't')}
              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/20 z-50 transition-colors"
              title="높이 조절"
            />
            <div 
              onMouseDown={(e) => handleResizeMouseDown(e, 'tl')}
              className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize hover:bg-primary/30 z-[60] rounded-tl-xl transition-colors"
              title="크기 조절"
            />
            {/* Header */}
            <div 
              onMouseDown={handleMouseDown}
              className="p-4 bg-primary text-on-primary flex items-center justify-between cursor-move select-none"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 animate-bounce" />
                <span className="font-bold text-[14px]">Agent-Guru AI</span>
              </div>
              <div className="flex items-center gap-3">
                {isGenerating && (
                  <div className="flex items-center bg-white/10 px-2 py-0.5 rounded text-[9px] font-bold animate-pulse">
                    ⚡ SEARCHING ACTIVE
                  </div>
                )}
                <button 
                  onClick={handleNewChat}
                  className="opacity-75 hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-[10px] flex items-center gap-1 font-bold transition-all"
                  title="새 대화 시작"
                >
                  <RefreshCw size={12} />
                  <span>새 대화</span>
                </button>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="opacity-70 hover:opacity-100 p-0.5 rounded-full hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Model Mode & Modification Mode Toggle Bar */}
            <div className="px-4 py-2 bg-surface-container border-b border-outline-variant/30 flex flex-col gap-2 text-[11px] shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-bold text-on-surface-variant flex items-center gap-1">
                  <Cpu size={14} className="text-primary" />
                  추론 모델 모드:
                </span>
                <div className="flex bg-surface-container-high rounded-full p-0.5 border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setModelMode('cloud')}
                    className={`px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase transition-all duration-200 ${
                      modelMode === 'cloud'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant/70 hover:bg-surface-container-highest'
                    }`}
                    title="Antigravity 2.0 Cloud API (Gemini Flash-Lite/Flash) 모델을 사용합니다."
                  >
                    Cloud
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelMode('turbo')}
                    className={`px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase transition-all duration-200 ${
                      modelMode === 'turbo'
                        ? 'bg-secondary text-on-secondary shadow-sm'
                        : 'text-on-surface-variant/70 hover:bg-surface-container-highest'
                    }`}
                    title="Antigravity 2.0 Cloud API (Gemini Pro) 모델을 사용합니다."
                  >
                    Turbo
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelMode('local')}
                    className={`px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase transition-all duration-200 ${
                      modelMode === 'local'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant/70 hover:bg-surface-container-highest'
                    }`}
                    title="Local Gemma-4 모델을 사용합니다."
                  >
                    Local
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

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-container-lowest/50">
              {chatHistory.map((msg, idx) => (
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
                        {preprocessMarkdown(msg.content)}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming Content */}
              {isGenerating && (
                <div className="flex flex-col items-start">
                  <span className="text-[10px] text-outline font-bold mb-1">Agent-Guru</span>
                  
                  {/* Live Thought Stream */}
                  {currentThoughts.length > 0 && (
                    <div className="w-full max-w-[90%] bg-surface-container border border-outline-variant/30 rounded-xl p-2.5 mb-2 text-xs">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary mb-1">
                        <RefreshCw className="animate-spin" size={12} />
                        <span>생각하는 중...</span>
                      </div>
                      <ul className="space-y-1.5 border-l-2 border-primary/20 pl-3">
                        {currentThoughts.map((t, tIdx) => (
                          <li key={tIdx} className={`text-on-surface-variant text-[11px] ${tIdx === currentThoughts.length - 1 ? 'font-bold text-primary animate-pulse' : ''}`}>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {currentResponse && (
                    <div className={`max-w-[90%] rounded-2xl leading-relaxed bg-surface-container border border-outline-variant/30 text-on-background rounded-tl-none markdown-body ${messageFontClass}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
                        {preprocessMarkdown(currentResponse)}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Meta Improvement Panel */}
            {metaImprovement && (
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
            <form onSubmit={handleChatSubmit} className="p-3 bg-surface border-t border-outline-variant/30 flex items-end gap-2">
              <textarea 
                placeholder={resourceStatus.busy ? "예약작업 중으로 대화가 제한됩니다." : searchApprovalRequest ? "웹 검색 승인이 진행 중입니다..." : "질문 입력..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isGenerating || resourceStatus.busy || !!searchApprovalRequest}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit(e);
                  }
                }}
                className={`flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary resize-none overflow-y-auto ${inputFontClass}`}
              />
              {isGenerating ? (
                <button 
                  type="button" 
                  onClick={handleStopGeneration}
                  className={`bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shrink-0 animate-pulse ${buttonSizeClass}`}
                  title="분석 중단"
                >
                  <X size={16} />
                </button>
              ) : (
                <button 
                  type="submit" 
                  disabled={!chatInput.trim() || resourceStatus.busy || !!searchApprovalRequest}
                  className={`bg-primary text-on-primary flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shrink-0 ${buttonSizeClass}`}
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </form>
          </div>
        ) : (
          /* Minimized Floating Button */
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
      {isPopupOpen && popupDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md transition-opacity">
          <div className="bg-surface-container border border-outline-variant/50 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-high">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-outline mb-1">
                  <BookOpen size={12} />
                  <span>{popupDoc.folder} (팝업 보기)</span>
                </div>
                <h3 className="text-lg font-bold text-on-background">{popupDoc.title}</h3>
              </div>
              <button 
                onClick={() => {
                  setIsPopupOpen(false);
                  setPopupDoc(null);
                  setPopupContent('');
                }}
                className="p-1.5 hover:bg-outline-variant/20 rounded-full transition-colors text-outline hover:text-on-background"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 markdown-body text-on-background bg-surface-container-lowest">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
                {preprocessMarkdown(popupContent)}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

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

      {/* Onboarding step-by-step tooltip guide */}
      <OnboardingGuide />


    </div>
  );
}

export default App;

function Interactive3DGraph({ documents, onSelectNode, fontScale = 'normal' }) {
  const canvasRef = React.useRef(null);
  const requestRef = React.useRef(null);
  
  // State for tracking which folders are manually expanded
  const [expandedFolders, setExpandedFolders] = React.useState(new Set(['llmwiki chat']));
  const [hoveredInfo, setHoveredInfo] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fontScaleRef = React.useRef(fontScale);
  React.useEffect(() => {
    fontScaleRef.current = fontScale;
  }, [fontScale]);

  const shouldResetPositionsRef = React.useRef(false);

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

  // Re-calculate visible nodes and links when documents or expandedFolders change
  React.useEffect(() => {
    if (!documents || documents.length === 0) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    // Group documents by folder
    const folderGroups = {};
    documents.forEach(doc => {
      const folder = doc.folder || 'Other';
      if (!folderGroups[folder]) {
        folderGroups[folder] = [];
      }
      folderGroups[folder].push(doc);
    });

    const nodes = [];
    const clusterNodesMap = {};

    // Center coordinates for folders (centered around 0,0,0 - compact configuration)
    const folderCenters = {
      'knowledge/macro': { x: -80, y: -50, z: -20 },
      'knowledge/institutions': { x: -60, y: -70, z: 10 },
      'knowledge/people': { x: -100, y: -30, z: 30 },
      'knowledge/tech_themes': { x: -30, y: -60, z: -30 },
      'knowledge/industries': { x: -40, y: -30, z: 20 },
      'knowledge/segments': { x: -20, y: -40, z: -10 },
      'knowledge/drafts': { x: -50, y: -10, z: 0 },
      'knowledge': { x: -60, y: -50, z: 0 },
      'snp500 report': { x: 70, y: -60, z: 30 },
      'macro report': { x: -80, y: 50, z: -30 },
      'tech trend': { x: 60, y: 60, z: -20 },
      'llmwiki chat': { x: 0, y: 0, z: 20 },
      'Other': { x: 0, y: 0, z: 0 }
    };

    // We get the previous node positions/velocities if they exist
    const prevNodesMap = {};
    if (stateRef.current.nodes && !shouldResetPositionsRef.current) {
      stateRef.current.nodes.forEach(n => {
        prevNodesMap[n.id] = { x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz };
      });
    }
    shouldResetPositionsRef.current = false;

    // 1. Generate Nodes (Individual or Cluster Node)
    Object.keys(folderGroups).forEach(folder => {
      const docs = folderGroups[folder];
      const isExpanded = expandedFolders.has(folder);
      
      let center = folderCenters[folder];
      if (!center) {
        if (folder.startsWith('knowledge')) {
          center = folderCenters['knowledge'];
        } else {
          center = folderCenters['Other'];
        }
      }

      if (!isExpanded && docs.length > 1) {
        // Create a single Cluster Node representing this folder
        const clusterId = `cluster-${folder}`;
        const prev = prevNodesMap[clusterId];
        
        let x, y, z;
        let vx = 0, vy = 0, vz = 0;
        if (prev) {
          x = prev.x; y = prev.y; z = prev.z;
          vx = prev.vx; vy = prev.vy; vz = prev.vz;
        } else {
          // Average position of previous child nodes
          let sumX = 0, sumY = 0, sumZ = 0, count = 0;
          docs.forEach(doc => {
            if (prevNodesMap[doc.path]) {
              sumX += prevNodesMap[doc.path].x;
              sumY += prevNodesMap[doc.path].y;
              sumZ += prevNodesMap[doc.path].z;
              count++;
            }
          });
          if (count > 0) {
            x = sumX / count;
            y = sumY / count;
            z = sumZ / count;
          } else {
            x = center.x;
            y = center.y;
            z = center.z;
          }
        }

        const folderDisplayName = getFolderDisplayName(folder);
        const clusterNode = {
          id: clusterId,
          title: `📁 ${folderDisplayName} [${docs.length}]`,
          folder: folder,
          isCluster: true,
          childCount: docs.length,
          x, y, z,
          vx, vy, vz,
          screenX: 0, screenY: 0, depth: 0, projectedScale: 1.0
        };
        nodes.push(clusterNode);
        clusterNodesMap[folder] = clusterNode;
      } else {
        // Create individual document nodes
        docs.forEach((doc, index) => {
          const prev = prevNodesMap[doc.path];
          let x, y, z;
          let vx = 0, vy = 0, vz = 0;
          if (prev) {
            x = prev.x; y = prev.y; z = prev.z;
            vx = prev.vx; vy = prev.vy; vz = prev.vz;
          } else {
            // Spawn near previous cluster node if existed
            const clusterId = `cluster-${folder}`;
            const prevCluster = prevNodesMap[clusterId];
            const spawnCenter = prevCluster || center;
            
            const angle = (index / docs.length) * 2 * Math.PI;
            const radius = 40 + Math.random() * 15;
            x = spawnCenter.x + radius * Math.cos(angle);
            y = spawnCenter.y + radius * Math.sin(angle);
            z = spawnCenter.z + (Math.random() * 40 - 20);
          }

          nodes.push({
            id: doc.path,
            title: doc.title,
            folder: doc.folder,
            docRef: doc,
            isCluster: false,
            x, y, z,
            vx, vy, vz,
            screenX: 0, screenY: 0, depth: 0, projectedScale: 1.0
          });
        });
      }
    });

    // 2. Generate Links
    const links = [];
    documents.forEach(docA => {
      const folderA = docA.folder || 'Other';
      const isAExpanded = expandedFolders.has(folderA);
      
      const sourceId = isAExpanded ? docA.path : `cluster-${folderA}`;
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (!sourceNode) return;

      const docALinks = docA.links || [];
      docALinks.forEach(linkedTitle => {
        const targetDoc = documents.find(d => 
          d.title.toLowerCase() === linkedTitle.toLowerCase()
        );
        if (targetDoc) {
          const folderB = targetDoc.folder || 'Other';
          const isBExpanded = expandedFolders.has(folderB);
          
          const targetId = isBExpanded ? targetDoc.path : `cluster-${folderB}`;
          const targetNode = nodes.find(n => n.id === targetId);
          
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

    // Also draw links between Cluster nodes and active children to anchor them visually
    Object.keys(folderGroups).forEach(folder => {
      const isExpanded = expandedFolders.has(folder);
      if (isExpanded) {
        const docs = folderGroups[folder];
        const center = folderCenters[folder] || folderCenters['Other'];
        
        const anchorId = `anchor-${folder}`;
        const prev = prevNodesMap[anchorId];
        let x, y, z;
        if (prev) {
          x = prev.x; y = prev.y; z = prev.z;
        } else {
          x = center.x; y = center.y; z = center.z;
        }

        const anchorNode = {
          id: anchorId,
          title: "",
          folder: folder,
          isAnchor: true,
          x, y, z,
          vx: 0, vy: 0, vz: 0,
          screenX: 0, screenY: 0, depth: 0, projectedScale: 0
        };
        nodes.push(anchorNode);

        docs.forEach(doc => {
          const childNode = nodes.find(n => n.id === doc.path);
          if (childNode) {
            links.push({
              source: anchorNode,
              target: childNode,
              id: `anchor-link-${folder}-${doc.path}`,
              isLayoutOnly: true
            });
          }
        });
      }
    });

    stateRef.current.nodes = nodes;
    stateRef.current.links = links;

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
        // Repulsion (coulomb force)
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].isAnchor) continue;
          for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[j].isAnchor) continue;
            const na = nodes[i];
            const nb = nodes[j];
            const dx = nb.x - na.x;
            const dy = nb.y - na.y;
            const dz = nb.z - na.z;
            
            // INCREASE Stabilizer constant to 10.0 to prevent infinity/NaN
            const distSq = dx*dx + dy*dy + dz*dz + 10.0;
            const dist = Math.sqrt(distSq);
            
            const maxRepulsionDist = (na.isCluster || nb.isCluster) ? 350 : 200;
            if (dist < maxRepulsionDist) {
              const charge = (na.isCluster || nb.isCluster) ? 200 : 80;
              // Scale down repulsion charge dynamically for high-density node counts to avoid explosions
              const densityFactor = nodes.length > 30 ? (30 / nodes.length) : 1.0;
              let force = (charge * densityFactor) / distSq;
              if (force > 40.0) force = 40.0; // Cap maximum repulsion force
              
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

        // Attraction (links)
        links.forEach(link => {
          const na = link.source;
          const nb = link.target;
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dz = nb.z - na.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
          
          let k = 0.008; // spring stiffness
          let restLength = 120;
          if (link.isLayoutOnly) {
            k = 0.03; // Keep children tightly bound around their virtual folder anchor
            restLength = 50;
          }
          
          let force = (dist - restLength) * k;
          // Cap attraction spring force to prevent numerical oscillation explosion
          if (force > 15.0) force = 15.0;
          if (force < -15.0) force = -15.0;
          
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
          const gravity = n.isAnchor ? 0.012 : 0.035;
          n.vx -= n.x * gravity;
          n.vy -= n.y * gravity;
          n.vz -= n.z * gravity;
        });

        // Apply velocity & damping
        nodes.forEach(n => {
          const damping = n.isAnchor ? 0.95 : 0.82;
          n.vx *= damping;
          n.vy *= damping;
          n.vz *= damping;
          
          // Cap node velocity to completely prevent numerical overshooting/explosion
          const maxSpeed = 7.0;
          const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy + n.vz * n.vz);
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

      // Sort nodes by depth (draw back elements first)
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
        ctx.strokeStyle = outlineColor;
        ctx.globalAlpha = opacity * 0.25;
        ctx.lineWidth = (na.isCluster || nb.isCluster) ? 0.75 : 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      });

      // Draw Nodes
      sortedNodes.forEach(n => {
        if (n.isAnchor) return; // Anchor nodes are invisible physics objects

        const isHovered = state.hoveredNode && state.hoveredNode.id === n.id;
        
        // Base node size
        let size = Math.max(2.0, (n.isCluster ? 9 : 5.0) * n.projectedScale * state.zoom);
        const maxDepth = 400;
        const opacity = Math.max(0.08, 1 - (n.depth + 200) / maxDepth);

        // Node folder coloring
        let color = primaryColor;
        if (n.folder === 'snp500 report') color = secondaryColor;
        else if (n.folder === 'llmwiki chat') color = '#10b981';
        else if (n.folder === 'macro report') color = '#f59e0b';
        else if (n.folder === 'knowledge/macro') color = '#f59e0b';
        else if (n.folder === 'knowledge/institutions') color = '#ec4899';
        else if (n.folder === 'knowledge/people') color = '#a855f7';
        else if (n.folder === 'knowledge/tech_themes') color = '#06b6d4';
        else if (n.folder === 'knowledge/industries') color = '#0d9488';
        else if (n.folder === 'knowledge/segments') color = '#6366f1';
        else if (n.folder === 'knowledge/drafts') color = '#94a3b8';
        
        // 1) Outer soft radial glow
        ctx.beginPath();
        ctx.arc(n.screenX, n.screenY, size * (n.isCluster ? 1.8 : 2.5), 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(n.screenX, n.screenY, 0, n.screenX, n.screenY, size * (n.isCluster ? 1.8 : 2.5));
        grad.addColorStop(0, color);
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = isHovered ? 0.8 : opacity * (n.isCluster ? 0.6 : 0.4);
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

        // 3) LOD Label Optimization
        // Skip drawing labels when zoom is extremely low and node is not hovered to improve FPS
        const shouldDrawLabel = isHovered || (state.zoom > 0.65 && opacity > 0.4);
        
        if (shouldDrawLabel) {
          const baseSize = isHovered 
            ? 11 
            : (n.isCluster ? 9.5 : 9);
          const scaledSize = baseSize * fontScaleVar;
          ctx.font = `${isHovered || n.isCluster ? 'bold ' : ''}${scaledSize}px sans-serif`;
            
          const text = n.title.length > 20 ? `${n.title.substring(0, 20)}...` : n.title;
          const textWidth = ctx.measureText(text).width;

          ctx.save();
          ctx.globalAlpha = isHovered ? 1.0 : opacity * 0.85;

          if (isHovered) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            const rectW = textWidth + 14;
            const rectH = 20;
            const rx = n.screenX - rectW / 2;
            const ry = n.screenY - size - rectH - 6;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rectW, rectH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.fillText(text, rx + 7, ry + 13.5);
          } else {
            // Standard Label text below node
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

  // Mouse Interaction Handlers
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
      // Hover detection
      let closest = null;
      let minDist = 22; // hover radius
      state.nodes.forEach(n => {
        if (n.isAnchor) return;
        const dx = n.screenX - mouseX;
        const dy = n.screenY - mouseY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) {
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
      if (state.hoveredNode.isCluster) {
        // Toggle expansion of clicked Cluster folder node
        toggleFolder(state.hoveredNode.folder);
      } else {
        // Select regular document node to preview it
        onSelectNode(state.hoveredNode.docRef);
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
          <p className="text-[11px] text-outline mt-1">지식 노드 매핑 및 클러스터 3차원 투영 계산 중</p>
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
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zoom-in"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
        </button>
        <button 
          onClick={handleZoomOut}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg hover:bg-surface transition-all text-on-surface"
          title="Zoom Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zoom-out"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>
        </button>
        <button 
          onClick={handleToggleAutoRotate}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg hover:bg-surface transition-all text-on-surface"
          title="Toggle Auto-Rotation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-compass"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
        </button>
        <button 
          onClick={handleResetLayout}
          className="w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg hover:bg-surface transition-all text-on-surface"
          title="Reset Graph Layout"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>
      </div>

      {hoveredInfo && (
        <div className="absolute top-6 right-6 p-4 rounded-xl glass border border-outline-variant/50 max-w-xs shadow-2xl pointer-events-none select-none z-10 animate-fade-in text-xs space-y-1.5">
          <div className="font-bold text-on-surface text-[13px]">{hoveredInfo.title}</div>
          <div className="flex gap-2">
            <span className="text-[10px] uppercase font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">{hoveredInfo.folder}</span>
            {hoveredInfo.isCluster && (
              <span className="text-[10px] uppercase font-semibold text-emerald-500 px-1.5 py-0.5 rounded bg-emerald-500/10">Cluster</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


