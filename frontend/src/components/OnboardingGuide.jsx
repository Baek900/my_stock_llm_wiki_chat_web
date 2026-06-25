import React, { useState, useEffect } from 'react';
import { X, ChevronRight, HelpCircle } from 'lucide-react';

export default function OnboardingGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const hasVisited = localStorage.getItem('visited_agent_guru');
    if (!hasVisited) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('visited_agent_guru', 'true');
    setIsOpen(false);
  };

  const steps = [
    {
      title: "📂 지식 탐색기 (Knowledge Explorer)",
      description: "왼쪽 사이드바에서 지식 위키, S&P 500 기업 리포트, 거시경제 분석 등 다양한 투자 문서를 폴더 트리 구조로 탐색하고 바로 읽어보실 수 있습니다.",
      target: "sidebar-explorer"
    },
    {
      title: "🌐 3D 지식 그래프 (Knowledge Graph)",
      description: "서로 연결된 지식 노드들의 관계를 3차원으로 시각화합니다. 📁 클러스터 노드를 클릭하여 하위 문서를 실시간으로 펼치거나 접으며 개념의 연결 고리를 파악하세요.",
      target: "sidebar-graph"
    },
    {
      title: "💬 Agent-Guru AI 챗봇",
      description: "오른쪽 하단의 플로팅 채팅 창을 통해 질문해 보세요. 로컬/클라우드 하이브리드 RAG를 사용하여 실시간 웹 탐색 결과가 반영된 고품질 투자 리서치 초안 보고서를 자동으로 작성해 우측 창에 띄워줍니다.",
      target: "floating-chat"
    },
    {
      title: "👁️ 포커스 모드 (Focus Mode)",
      description: "금융 리포트를 장시간 깊이 있게 검토하거나 작성할 때 유용합니다. 좌측 메뉴와 우측 챗봇을 한 번에 숨기고, 오직 문서 본문에만 100% 집중할 수 있는 쾌적한 레이아웃을 제공합니다.",
      target: "focus-toggle"
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  if (!isOpen) {
    // Show a small help trigger in the corner if they want to replay the guide
    return (
      <button 
        onClick={() => { setIsOpen(true); setCurrentStep(0); }}
        className="fixed bottom-6 left-6 w-9 h-9 rounded-full glass border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all shadow-lg z-40"
        title="도움말 가이드 다시 보기"
      >
        <HelpCircle size={18} />
      </button>
    );
  }

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-surface-container border border-primary/20 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Soft decorative background glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-primary/10 blur-2xl" />
        
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 hover:bg-surface-container-high rounded-full transition-colors text-outline hover:text-on-surface"
        >
          <X size={16} />
        </button>

        <div className="mb-4">
          <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-full">
            ONBOARDING GUIDE ({currentStep + 1} / {steps.length})
          </span>
        </div>

        <h3 className="text-lg font-bold text-on-background mb-2">{step.title}</h3>
        <p className="text-xs text-on-surface-variant leading-relaxed mb-6">
          {step.description}
        </p>

        <div className="flex items-center justify-between border-t border-outline-variant/20 pt-4 mt-2">
          <button 
            onClick={handleClose}
            className="text-[11px] font-bold text-outline hover:text-on-surface-variant transition-colors"
          >
            가이드 건너뛰기
          </button>
          
          <button 
            onClick={handleNext}
            className="px-4 py-2 rounded-xl bg-primary text-on-primary text-[11px] font-bold flex items-center gap-1 hover:opacity-90 transition-all shadow-md"
          >
            <span>{currentStep === steps.length - 1 ? '시작하기' : '다음 단계'}</span>
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
