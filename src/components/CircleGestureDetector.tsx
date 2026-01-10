import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureStartTimeRef = useRef<number | null>(null);
  const lastPointRef = useRef<Point | null>(null);

  // Функция проверки, является ли траектория круговой
  const isCircularGesture = (points: Point[]): { isCircle: boolean; center: { x: number; y: number } | null; radius: number } => {
    if (points.length < 10) {
      return { isCircle: false, center: null, radius: 0 };
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

    // Проверяем, что все точки примерно на одинаковом расстоянии от центра
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgRadius, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgRadius > 0 ? stdDev / avgRadius : 1;

    // Проверяем, что траектория достаточно круглая (коэффициент вариации < 0.3)
    const isCircle = coefficientOfVariation < 0.3 && avgRadius > 50 && avgRadius < 400;

    return {
      isCircle,
      center: isCircle ? { x: avgX, y: avgY } : null,
      radius: isCircle ? avgRadius : 0
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
      
      // Очищаем canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleMove = (x: number, y: number) => {
      if (!isActive || !enabled) return;

      const now = Date.now();
      
      // Проверяем минимальное расстояние между точками (чтобы избежать скопления точек)
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

      // Отрисовываем траекторию
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (currentPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[currentPoints.length - 2].x, currentPoints[currentPoints.length - 2].y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Проверяем, является ли жесть круговым (каждые 20 точек)
      if (currentPoints.length % 20 === 0 && currentPoints.length >= 20) {
        const check = isCircularGesture(currentPoints);
        if (check.isCircle && check.center) {
          setCircleCenter(check.center);
          setCircleRadius(check.radius);
          
          // Рисуем центр круга
          ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, 8, 0, Math.PI * 2);
          ctx.fill();
          
          // Рисуем окружность
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, check.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    const handleEnd = () => {
      if (!isActive) return;
      isActive = false;
      setIsDrawing(false);

      // Проверяем финальную траекторию
      if (currentPoints.length >= 20) {
        const check = isCircularGesture(currentPoints);
        if (check.isCircle && check.center) {
          // Жест завершен, ждем нажатия в центр
          setCircleCenter(check.center);
          setCircleRadius(check.radius);
          
          // Рисуем финальный круг и центр
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, check.radius, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(168, 85, 247, 1)';
          ctx.beginPath();
          ctx.arc(check.center.x, check.center.y, 12, 0, Math.PI * 2);
          ctx.fill();
          
          // Сохраняем центр для последующего клика
          setTimeout(() => {
            if (circleCenter) {
              // Очищаем canvas через 2 секунды, если не было нажатия
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              setCircleCenter(null);
              setCircleRadius(0);
              setPoints([]);
            }
          }, 2000);
        } else {
          // Жест не является круговым, очищаем
          setTimeout(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setPoints([]);
            setCircleCenter(null);
            setCircleRadius(0);
          }, 500);
        }
      } else {
        // Недостаточно точек, очищаем
        setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setPoints([]);
          setCircleCenter(null);
          setCircleRadius(0);
        }, 300);
      }
    };

    // Обработка клика в центр круга
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (!circleCenter || !enabled) return;

      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      
      if (!clientX || !clientY) return;

      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Проверяем, клик в пределах радиуса от центра
      const dx = x - circleCenter.x;
      const dy = y - circleCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= circleRadius * 1.2) {
        // Клик в центр - активируем режим
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onCircleComplete(circleCenter);
        setCircleCenter(null);
        setCircleRadius(0);
        setPoints([]);
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
    };
  }, [enabled, circleCenter, circleRadius, onCircleComplete]);

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
      {/* Индикатор центра круга */}
      <AnimatePresence>
        {circleCenter && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute w-6 h-6 rounded-full bg-purple-500 border-2 border-white"
            style={{
              left: `${circleCenter.x}px`,
              top: `${circleCenter.y}px`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
