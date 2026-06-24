import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Search, BookOpen, MessageSquare, ShieldAlert, Cpu, 
  ChevronRight, RefreshCw, Sun, Moon, ArrowRight, Check, X,
  FileText, Globe, Lightbulb, Network, ZoomIn, ZoomOut, Maximize2, Minimize2, Eye
} from 'lucide-react';
import './App.css';function TreeNode({ node, onSelect, selectedPath }) {
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
      const folder = doc.folder || 'other';
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

    try {
      await fetch('http://127.0.0.1:8080/api/documents/clear_drafts', { method: 'POST' });
      fetchDocuments(searchQuery);
    } catch (e) {
      console.error('Failed to clear drafts on new chat:', e);
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
    if (activeFilter === 'knowledge') return doc.folder === 'knowledge';
    if (activeFilter === 'snp500') return doc.folder === 'snp500 report';
    if (activeFilter === 'macro') return doc.folder === 'macro report';
    if (activeFilter === 'trend') return doc.folder === 'tech trend';
    return true;
  });

  return (
    <div className={`flex w-screen h-screen overflow-hidden bg-background text-on-background ${darkMode ? 'dark' : ''}`}>
      
      {/* 1. Sidebar Navigation (Left) */}
      <aside className="w-[280px] h-full flex flex-col py-6 border-r border-outline-variant/30 bg-surface z-40">
        <div className="px-6 mb-8">
          <div className="flex items-center gap-2">
            <Cpu className="text-primary w-6 h-6 animate-pulse" />
            <h1 className="text-xl font-extrabold text-primary tracking-tight">Second Brain</h1>
          </div>
          <p className="text-[10px] font-semibold text-on-surface-variant tracking-widest uppercase mt-1">AI Research Hub</p>
        </div>

        {/* Tab Links */}
        <nav className="flex-1 px-4 space-y-1">
          <button 
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
        <div className="px-4 mt-auto">
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

          <div className="flex items-center gap-4">
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
              <section className="w-[350px] h-full border-r border-outline-variant/30 bg-surface/40 flex flex-col overflow-hidden">
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
                            doc.folder === 'knowledge' ? 'bg-primary-container text-on-primary-container' :
                            doc.folder === 'snp500 report' ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-container text-on-tertiary-container'
                          }`}>
                            {doc.folder === 'knowledge' ? '지식 위키' : 
                             doc.folder === 'snp500 report' ? 'S&P 500' : 
                             doc.folder === 'macro report' ? '매크로' : '트렌드'}
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
              <main className="flex-1 h-full overflow-y-auto bg-surface-container-lowest p-8">
                {selectedDoc ? (
                  <div className="max-w-3xl mx-auto">
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
                  <div className="max-w-3xl mx-auto">
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
            <Interactive3DGraph documents={documents} onSelectNode={selectDocument} />
          )}
        </div>
      </div>

      {/* 3. Floating/Minimized Chat Panel (Bottom Right) */}
      <div className={`fixed bottom-6 right-6 flex flex-col z-50 transition-all duration-300 ${
        isChatOpen ? 'w-[450px] h-[600px]' : 'w-14 h-14'
      }`}>
        {isChatOpen ? (
          /* Minimized Window when Open */
          <div className="w-full h-full glass border border-primary/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-primary text-on-primary flex items-center justify-between">
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
                    disabled
                    className="px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase opacity-45 cursor-not-allowed text-on-surface-variant/70"
                    title="Quota 제한으로 사용 불가능"
                  >
                    Cloud
                  </button>
                  <button
                    type="button"
                    className="px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-primary text-on-primary shadow-sm"
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

                  <div className={`max-w-[90%] p-3.5 rounded-2xl text-[13px] leading-relaxed ${
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
                    <div className="max-w-[90%] p-3.5 rounded-2xl text-[13px] leading-relaxed bg-surface-container border border-outline-variant/30 text-on-background rounded-tl-none markdown-body">
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
                placeholder={resourceStatus.busy ? "예약작업 중으로 대화가 제한됩니다." : "질문 입력..."}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isGenerating || resourceStatus.busy}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit(e);
                  }
                }}
                className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl py-2 px-3.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none overflow-y-auto max-h-24"
              />
              {isGenerating ? (
                <button 
                  type="button" 
                  onClick={handleStopGeneration}
                  className="w-8 h-8 rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shrink-0 animate-pulse"
                  title="분석 중단"
                >
                  <X size={16} />
                </button>
              ) : (
                <button 
                  type="submit" 
                  disabled={!chatInput.trim() || resourceStatus.busy}
                  className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all shrink-0"
                >
                  <ArrowRight size={16} />
                </button>
              )}
            </form>
          </div>
        ) : (
          /* Minimized Floating Button */
          <button 
            onClick={() => setIsChatOpen(true)}
            className="w-14 h-14 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all"
          >
            <MessageSquare size={24} className="animate-pulse" />
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

    </div>
  );
}

export default App;

function Interactive3DGraph({ documents, onSelectNode }) {
  const canvasRef = React.useRef(null);
  const requestRef = React.useRef(null);
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

  const [hoveredInfo, setHoveredInfo] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Initialize nodes and links
  React.useEffect(() => {
    if (!documents || documents.length === 0) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    // Create 3D nodes
    const nodes = documents.map(doc => {
      // Pick initial random position in 3D space
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 100 + Math.random() * 150;
      
      return {
        id: doc.path,
        title: doc.title,
        folder: doc.folder,
        docRef: doc,
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        vx: 0,
        vy: 0,
        vz: 0,
        screenX: 0,
        screenY: 0,
        depth: 0,
        projectedScale: 1.0
      };
    });

    // Create links
    const links = [];
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
            links.push({
              source: sourceNode,
              target: targetNode,
              id: `link-${sourceNode.id}-${targetNode.id}`
            });
          }
        }
      });
    });

    stateRef.current.nodes = nodes;
    stateRef.current.links = links;

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [documents]);

  // Main Loop: Physics, Projection, and Drawing
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Resize handler
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

      // 1. Physics Simulation (Force-directed)
      if (nodes.length > 0) {
        // Repulsion (coulomb force)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const na = nodes[i];
            const nb = nodes[j];
            const dx = nb.x - na.x;
            const dy = nb.y - na.y;
            const dz = nb.z - na.z;
            const distSq = dx*dx + dy*dy + dz*dz + 0.1;
            const dist = Math.sqrt(distSq);
            if (dist < 400) {
              const force = 120 / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              const fz = (dz / dist) * force;
              na.vx -= fx; na.vy -= fy; na.vz -= fz;
              nb.vx += fx; nb.vy += fy; nb.vz += fz;
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
          const k = 0.008; // spring stiffness
          const restLength = 120;
          const force = (dist - restLength) * k;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          na.vx += fx; na.vy += fy; na.vz += fz;
          nb.vx -= fx; nb.vy -= fy; nb.vz -= fz;
        });

        // Center gravity
        nodes.forEach(n => {
          const gravity = 0.005;
          n.vx -= n.x * gravity;
          n.vy -= n.y * gravity;
          n.vz -= n.z * gravity;
        });

        // Apply velocity & damping
        nodes.forEach(n => {
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.vz *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          n.z += n.vz;
        });
      }

      // 2. Camera Rotation
      if (state.autoRotate && !state.dragging) {
        state.yaw += 0.002;
      }

      // 3. Perspective Projection
      const sinY = Math.sin(state.yaw);
      const cosY = Math.cos(state.yaw);
      const sinP = Math.sin(state.pitch);
      const cosP = Math.cos(state.pitch);

      nodes.forEach(n => {
        // Rotate around Y axis (yaw)
        let x1 = n.x * cosY - n.z * sinY;
        let z1 = n.x * sinY + n.z * cosY;
        // Rotate around X axis (pitch)
        let y2 = n.y * cosP - z1 * sinP;
        let z2 = n.y * sinP + z1 * cosP;

        const cameraDist = 700;
        const scale = cameraDist / (cameraDist + z2);
        
        n.screenX = width / 2 + x1 * scale * state.zoom;
        n.screenY = height / 2 + y2 * scale * state.zoom;
        n.depth = z2;
        n.projectedScale = scale;
      });

      // 4. Drawing
      ctx.clearRect(0, 0, width, height);

      // Get colors from CSS Variables
      const bodyStyle = getComputedStyle(document.body);
      const primaryColor = bodyStyle.getPropertyValue('--color-primary').trim() || '#3b82f6';
      const secondaryColor = bodyStyle.getPropertyValue('--color-secondary').trim() || '#a855f7';
      const outlineColor = bodyStyle.getPropertyValue('--color-outline-variant').trim() || '#444';
      const textColor = bodyStyle.getPropertyValue('--color-on-background').trim() || '#fff';

      // Sort nodes by depth (draw back nodes first)
      const sortedNodes = [...nodes].sort((a, b) => b.depth - a.depth);

      // Draw Links
      links.forEach(link => {
        const na = link.source;
        const nb = link.target;

        // Depth fading for links
        const avgDepth = (na.depth + nb.depth) / 2;
        const maxDepth = 400;
        const opacity = Math.max(0.05, 1 - (avgDepth + 200) / maxDepth);

        ctx.beginPath();
        ctx.moveTo(na.screenX, na.screenY);
        ctx.lineTo(nb.screenX, nb.screenY);
        ctx.strokeStyle = outlineColor;
        ctx.globalAlpha = opacity * 0.3;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      });

      // Draw Nodes
      sortedNodes.forEach(n => {
        const size = Math.max(2.5, 5 * n.projectedScale * state.zoom);
        const maxDepth = 400;
        const opacity = Math.max(0.1, 1 - (n.depth + 200) / maxDepth);

        // Radial glow gradient for node
        ctx.beginPath();
        ctx.arc(n.screenX, n.screenY, size * 2.5, 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(n.screenX, n.screenY, 0, n.screenX, n.screenY, size * 2.5);
        
        let color = primaryColor;
        if (n.folder === 'snp500 report') color = secondaryColor;
        if (n.folder === 'llmwiki chat') color = '#10b981';
        if (n.folder === 'macro report') color = '#f59e0b';
        
        grad.addColorStop(0, color);
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = opacity * 0.5;
        ctx.fill();

        // Node center core
        ctx.beginPath();
        ctx.arc(n.screenX, n.screenY, size * 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Text label drawing logic
        const isHovered = state.hoveredNode && state.hoveredNode.id === n.id;
        if (isHovered || opacity > 0.45 || nodes.length < 30) {
          ctx.font = isHovered ? 'bold 11px sans-serif' : '9px sans-serif';
          const text = n.title.length > 18 ? `${n.title.substring(0, 18)}...` : n.title;
          const textWidth = ctx.measureText(text).width;

          ctx.save();
          ctx.globalAlpha = isHovered ? 1.0 : opacity * 0.7;

          // Draw label background for hovered node
          if (isHovered) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            // Draw a rounded rect
            const rectW = textWidth + 12;
            const rectH = 18;
            const rx = n.screenX - rectW / 2;
            const ry = n.screenY - size - rectH - 4;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rectW, rectH, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.fillText(text, rx + 6, ry + 12);
          } else {
            // Draw standard text below node
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.fillText(text, n.screenX, n.screenY + size + 11);
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

  // Interactivity Handlers
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
      // Find closest node for hover
      let closest = null;
      let minDist = 20; // hover radius
      state.nodes.forEach(n => {
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
      onSelectNode(state.hoveredNode.docRef);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const state = stateRef.current;
    if (e.deltaY < 0) {
      state.zoom = Math.min(state.zoom + 0.05, 3.0);
    } else {
      state.zoom = Math.max(state.zoom - 0.05, 0.4);
    }
  };

  // Zoom helpers
  const handleZoomIn = () => {
    stateRef.current.zoom = Math.min(stateRef.current.zoom + 0.2, 3.0);
  };

  const handleZoomOut = () => {
    stateRef.current.zoom = Math.max(stateRef.current.zoom - 0.2, 0.4);
  };

  const handleToggleAutoRotate = () => {
    stateRef.current.autoRotate = !stateRef.current.autoRotate;
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
          <p className="text-[11px] text-outline mt-1">지식 노드 {documents?.length || 0}개 매핑 및 3차원 위치 계산 중</p>
        </div>
      )}
      
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
          className={`w-10 h-10 rounded-xl glass border border-outline-variant/50 flex items-center justify-center shadow-lg transition-all text-on-surface hover:bg-surface`}
          title="Toggle Auto-Rotation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
        </button>
      </div>

      {hoveredInfo && (
        <div className="absolute top-6 right-6 p-4 rounded-xl glass border border-outline-variant/50 max-w-xs shadow-2xl pointer-events-none select-none z-10 animate-fade-in text-xs space-y-1.5">
          <div className="font-bold text-on-surface text-[13px]">{hoveredInfo.title}</div>
          <div className="flex gap-2">
            <span className="text-[10px] uppercase font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">{hoveredInfo.folder}</span>
            {hoveredInfo.category && (
              <span className="text-[10px] uppercase font-semibold text-secondary px-1.5 py-0.5 rounded bg-secondary/10">{hoveredInfo.category}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
