import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { trackEvent } from '../lib/analytics';

interface CircleGestureDetectorProps {
  onCircleComplete: (center: { x: number; y: number }) => void;
  enabled: boolean;
}

// Интерфейс для точки траектории
interface Point {
  x: number;
  y: number;
  timestamp: number;
}

export const CircleGestureDetector: React.FC<CircleGestureDetectorProps> = ({ 
  onCircleComplete, 
  enabled 
}) => {
  const [points, setPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [circleCenter, setCircleCenter] = useState<{ x: number; y: number } | null>(null);
  const [circleRadius, setCircleRadius] = useState(0);
  const [circleProgress, setCircleProgress] = useState(0); // 0-1
  const [showCenterTarget, setShowCenterTarget] = useState(false);
  const [hasTriggered75Percent, setHasTriggered75Percent] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureStartTimeRef = useRef<number | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const centerTargetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathLengthRef = useRef<number>(0);

  // Минимальный радиус круга (20-25% ширины экрана)
  const getMinRadius = (): number => {
    if (!containerRef.current) return 100;
    const width = containerRef.current.getBoundingClientRect().width;
    return width * 0.2; // 20% ширины экрана
  };

  // Минимальная длина пути (75% окружности)
  const getMinPathLength = (radius: number): number => {
    return 2 * Math.PI * radius * 0.75; // 75% окружности
  };

  // Функция проверки, является ли траектория круговой
  const isCircularGesture = (points: Point[]): { 
    isCircle: boolean; 
    center: { x: number; y: number } | null; 
    radius: number;
    progress: number;
    pathLength: number;
  } => {
    if (points.length < 10) {
      return { isCircle: false, center: null, radius: 0, progress: 0, pathLength: 0 };
    }

    // Вычисляем центр точек (среднее арифметическое)
    const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    // Вычисляем среднее расстояние от центра (радиус)
    const distances = points.map(p => {
      const dx = p.x - avgX;
      const dy = p.y - avgY;
      return Math.sqrt(dx * dx + dy * dy);
    });
    const avgRadius = distances.reduce((sum, d) => sum + d, 0) / distances.length;

    // Проверяем минимальный радиус
    const minRadius = getMinRadius();
    if (avgRadius < minRadius) {
      return { isCircle: false, center: null, radius: 0, progress: 0, pathLength: 0 };
    }

    // Вычисляем длину пути
    let pathLength = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      pathLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Проверяем, что все точки примерно на одинаковом расстоянии от центра
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgRadius, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgRadius > 0 ? stdDev / avgRadius : 1;

    // Проверяем, что траектория достаточно круглая (коэффициент вариации < 0.3)
    const isCircle = coefficientOfVariation < 0.3 && avgRadius >= minRadius && avgRadius < 400;

    // Вычисляем прогресс (длина пути / минимальная требуемая длина)
    const minPathLength = getMinPathLength(avgRadius);
    const progress = Math.min(pathLength / minPathLength, 1);

    return {
      isCircle,
      center: isCircle ? { x: avgX, y: avgY } : null,
      radius: isCircle ? avgRadius : 0,
      progress,
      pathLength,
    };
  };

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Устанавливаем размеры canvas
    const updateCanvasSize = () => {
      if (container && canvas) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    let currentPoints: Point[] = [];
    let isActive = false;

    const handleStart = (x: number, y: number) => {
      if (!enabled) return;
      isActive = true;
      setIsDrawing(true);
      currentPoints = [{ x, y, timestamp: Date.now() }];
      gestureStartTimeRef.current = Date.now();
      lastPointRef.current = { x, y, timestamp: Date.now() };
      setCircleCenter(null);
      setCircleRadius(0);
      setCircleProgress(0);
      setShowCenterTarget(false);
      setHasTriggered75Percent(false);
      pathLengthRef.current = 0;
      
      // Очищаем canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Analytics
      trackEvent('mode_switch_gesture_started');
    };

    const handleMove = (x: number, y: number) => {
      if (!isActive || !enabled) return;

      const now = Date.now();
      
      // Проверяем минимальное расстояние между точками
      if (lastPointRef.current) {
        const dx = x - lastPointRef.current.x;
        const dy = y - lastPointRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 5) return; // Минимум 5px между точками
      }

      const newPoint: Point = { x, y, timestamp: now };
      currentPoints.push(newPoint);
      lastPointRef.current = newPoint;
      setPoints([...currentPoints]);

      // Вычисляем длину пути
      if (currentPoints.length > 1) {
        const dx = x - currentPoints[currentPoints.length - 2].x;
        const dy = y - currentPoints[currentPoints.length - 2].y;
        pathLengthRef.current += Math.sqrt(dx * dx + dy * dy);
      }

      // Проверяем минимальную длительность (500ms)
      const duration = now - (gestureStartTimeRef.current || now);
      if (duration < 500) return;

      // Проверяем максимальную длительность (4s)
      if (duration > 4000) {
        handleEnd();
        return;
      }

      // Отрисовываем траекторию с визуальной обратной связью
      const check = isCircularGesture(currentPoints);
      setCircleProgress(check.progress);

      if (check.isCircle && check.center) {
        setCircleCenter(check.center);
        setCircleRadius(check.radius);
        pathLengthRef.current = check.pathLength;

        // Визуальная обратная связь: мягкое свечение вдоль пути
        ctx.strokeStyle = `rgba(168, 85, 247, ${0.4 + check.progress * 0.4})`;
        ctx.lineWidth = 3 + check.progress * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 10 * check.progress;
        ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
        
        if (currentPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(currentPoints[currentPoints.length - 2].x, currentPoints[currentPoints.length - 2].y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        // При достижении 75% - хаптик и визуальная обратная связь
        if (check.progress >= 0.75 && !hasTriggered75Percent) {
          setHasTriggered75Percent(true);
          
          // Haptic feedback
          if (window.Telegram?.WebApp?.HapticFeedback) {
            try {
              window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
            } catch (e) {
              console.warn('Haptic error:', e);
            }
          }

          // Analytics
          trackEvent('mode_switch_gesture_75_percent');

          // Показываем центр-таргет
          setShowCenterTarget(true);

          // Рисуем мягкое свечение в центре
          ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
          ctx.shadowBlur = 20;
          ctx.shadowColor = 'rgba(168, 85, 247, 1)';
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Рисуем окружность при прогрессе > 75%
        if (check.progress >= 0.75) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, check.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // Обычная отрисовка пути
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 0;
        
        if (currentPoints.length > 1) {
          ctx.beginPath();
          ctx.moveTo(currentPoints[currentPoints.length - 2].x, currentPoints[currentPoints.length - 2].y);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
    };

    const handleEnd = () => {
      if (!isActive) return;
      isActive = false;
      setIsDrawing(false);

      // Проверяем минимальную длительность
      const duration = gestureStartTimeRef.current 
        ? Date.now() - gestureStartTimeRef.current 
        : 0;
      
      if (duration < 500) {
        // Слишком быстро - игнорируем
        setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setPoints([]);
          setCircleCenter(null);
          setCircleRadius(0);
          setCircleProgress(0);
          setShowCenterTarget(false);
          setHasTriggered75Percent(false);
        }, 300);
        return;
      }

      // Проверяем финальную траекторию
      if (currentPoints.length >= 20) {
        const check = isCircularGesture(currentPoints);
        if (check.isCircle && check.center && check.progress >= 0.75) {
          // Жест завершен, показываем центр-таргет
          setCircleCenter(check.center);
          setCircleRadius(check.radius);
          setCircleProgress(check.progress);
          setShowCenterTarget(true);

          // Рисуем финальный круг и центр
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
          ctx.lineWidth = 3;
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, check.radius, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Устанавливаем таймаут для скрытия центра-таргета (5 секунд)
          if (centerTargetTimeoutRef.current) {
            clearTimeout(centerTargetTimeoutRef.current);
          }
          centerTargetTimeoutRef.current = setTimeout(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setCircleCenter(null);
            setCircleRadius(0);
            setCircleProgress(0);
            setShowCenterTarget(false);
            setHasTriggered75Percent(false);
            trackEvent('mode_switch_switch_cancelled', { reason: 'timeout' });
          }, 5000);
        } else {
          // Жест не является круговым или недостаточный прогресс
          setTimeout(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setPoints([]);
            setCircleCenter(null);
            setCircleRadius(0);
            setCircleProgress(0);
            setShowCenterTarget(false);
            setHasTriggered75Percent(false);
          }, 500);
        }
      } else {
        // Недостаточно точек
        setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setPoints([]);
          setCircleCenter(null);
          setCircleRadius(0);
          setCircleProgress(0);
          setShowCenterTarget(false);
          setHasTriggered75Percent(false);
        }, 300);
      }
    };

    // Обработка клика в центр круга
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (!circleCenter || !enabled || !showCenterTarget) return;

      const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as MouseEvent).clientY;
      
      if (!clientX || !clientY) return;

      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Проверяем, клик в пределах радиуса от центра (с запасом)
      const dx = x - circleCenter.x;
      const dy = y - circleCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Увеличиваем зону клика для удобства (до 1.5 радиуса)
      if (distance <= circleRadius * 1.5) {
        // Клик в центр - активируем переключение
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Analytics
        trackEvent('mode_switch_center_tap_confirmed');
        
        onCircleComplete(circleCenter);
        setCircleCenter(null);
        setCircleRadius(0);
        setCircleProgress(0);
        setShowCenterTarget(false);
        setHasTriggered75Percent(false);
        
        if (centerTargetTimeoutRef.current) {
          clearTimeout(centerTargetTimeoutRef.current);
          centerTargetTimeoutRef.current = null;
        }
      }
    };

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      handleStart(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isActive) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      handleMove(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isActive) return;
      e.preventDefault();
      handleEnd();
    };

    // Touch events
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const rect = container.getBoundingClientRect();
        handleStart(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isActive || e.touches.length !== 1) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      handleMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isActive) return;
      e.preventDefault();
      handleEnd();
    };

    // Добавляем обработчики
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    // Обработчик клика для активации
    container.addEventListener('click', handleClick);
    container.addEventListener('touchend', handleClick);

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('click', handleClick);
      
      if (centerTargetTimeoutRef.current) {
        clearTimeout(centerTargetTimeoutRef.current);
      }
    };
  }, [enabled, circleCenter, circleRadius, showCenterTarget, hasTriggered75Percent, onCircleComplete]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-[3000]"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: enabled ? 'auto' : 'none' }}
      />
      {/* Индикатор центра круга с анимацией */}
      <AnimatePresence>
        {showCenterTarget && circleCenter && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 border-2 border-white shadow-lg shadow-purple-500/50 pointer-events-auto cursor-pointer"
            style={{
              left: `${circleCenter.x}px`,
              top: `${circleCenter.y}px`,
              width: '32px',
              height: '32px',
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (circleCenter) {
                trackEvent('mode_switch_center_tap_confirmed');
                onCircleComplete(circleCenter);
                setShowCenterTarget(false);
                setCircleCenter(null);
              }
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
