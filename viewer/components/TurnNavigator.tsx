"use client";

import { useState } from "react";
import { RunTurn } from "@/lib/types";
import { TurnCard } from "./TurnCard";

interface TurnNavigatorProps {
  turns: RunTurn[];
}

export function TurnNavigator({ turns }: TurnNavigatorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (turns.length === 0) {
    return null;
  }

  const currentTurn = turns[currentIndex];
  const previousTurn = currentIndex > 0 ? turns[currentIndex - 1] : null;
  const total = turns.length;

  const goPrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : prev));
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(parseInt(e.target.value, 10));
  };

  // Calculate tooltip position (percentage)
  const thumbPosition = total > 1 ? (currentIndex / (total - 1)) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Turn navigation bar */}
      <div className="bg-white rounded-2xl border border-pizarra-200 px-4 py-4 sm:px-6 space-y-4">
        {/* Header con título y flechas */}
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pizarra-700 to-pizarra-800 flex items-center justify-center text-xl shadow-lg">
            📋
          </div>
          <div>
            <h2 className="text-sm font-semibold text-pizarra-700">
              Turn timeline
            </h2>
            <p className="text-xs text-pizarra-500">
                Turn {currentIndex + 1} of {total} • Use the slider to navigate between turns
            </p>
          </div>
        </div>

          <div className="flex items-center gap-2">
            {/* Current time highlighted */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sidra-50 border border-sidra-200">
              <span className="text-lg">🕐</span>
              <span className="text-sm font-semibold text-sidra-700">
                {currentTurn.time}
          </span>
            </div>

            {/* Navigation arrows */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-pizarra-200 text-pizarra-600 hover:bg-pizarra-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Previous turn"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={currentIndex === total - 1}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-pizarra-200 text-pizarra-600 hover:bg-pizarra-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Next turn"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
        </div>

        {/* Time slider */}
        <div className="flex justify-center">
          <div className="relative pt-8 pb-2 w-[95%]">
            {/* Floating tooltip with time */}
            <div 
              className="absolute -top-1 pointer-events-none transition-all duration-150 ease-out"
              style={{ 
                left: `calc(${thumbPosition}% + ${10 - (thumbPosition * 0.2)}px)`,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="relative">
                <div className="px-2 py-1 bg-sidra-600 text-white text-xs font-semibold rounded-md shadow-lg whitespace-nowrap">
                  {currentTurn.time}
                </div>
                <div className="absolute left-1/2 -bottom-1 transform -translate-x-1/2 w-2 h-2 bg-sidra-600 rotate-45"></div>
              </div>
            </div>

            {/* Slider input */}
            <input
              type="range"
              min={0}
              max={total - 1}
              value={currentIndex}
              onChange={handleSliderChange}
              className="slider-timeline relative z-20 w-full h-2 appearance-none cursor-pointer rounded-full focus:outline-none"
              style={{
                background: `linear-gradient(to right, #d97706 0%, #d97706 ${thumbPosition}%, #e2e8f0 ${thumbPosition}%, #e2e8f0 100%)`,
              }}
            />
          </div>
        </div>

      </div>

      {/* Current turn */}
      <TurnCard 
        turn={currentTurn} 
        index={currentIndex} 
        defaultExpanded 
        previousTurn={previousTurn}
      />
    </div>
  );
}
