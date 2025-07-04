import React, { useState, useEffect, useRef } from 'react';

const AnimatedClock: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const clockRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  // Update clock time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Handle mouse movement for 3D rotation effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!clockRef.current || !hover) return;
      
      const rect = clockRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate mouse position relative to the center of the clock
      const mouseX = (e.clientX - centerX) / (rect.width / 2);
      const mouseY = (e.clientY - centerY) / (rect.height / 2);
      
      // Apply more pronounced rotation (max 15 degrees)
      setRotation({
        x: mouseY * 15,
        y: -mouseX * 15
      });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [hover]);

  // Calculate hand angles
  const seconds = time.getSeconds();
  const minutes = time.getMinutes();
  const hours = time.getHours() % 12;
  
  const secondsDegrees = seconds * 6; // 6 degrees per second
  const minutesDegrees = minutes * 6 + seconds * 0.1; // 6 degrees per minute + small adjustment
  const hoursDegrees = hours * 30 + minutes * 0.5; // 30 degrees per hour + adjustment for minutes

  // Generate hour markers
  const hourMarkers = [];
  // Start from index 3 (4 o'clock) to avoid any markers in the top section
  for (let i = 3; i < 12; i++) {
    const angle = i * 30; // 30 degrees per hour
    const isMainHour = i % 3 === 0; // Highlight 12, 3, 6, 9
    hourMarkers.push(
      <div 
        key={i}
        className={`absolute ${isMainHour ? 'w-1 h-2' : 'w-0.5 h-1.5'} bg-[#1a237e] rounded-full`}
        style={{
          transform: `rotate(${angle}deg) translate(0, -35%)`,
          top: '12%',
          left: '50%',
          marginLeft: isMainHour ? '-0.5px' : '-0.25px',
          transformOrigin: 'center bottom'
        }}
      ></div>
    );
  }

  return (
    <div 
      ref={clockRef}
      className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full shadow-lg transition-all duration-300"
      style={{
        transform: `perspective(1000px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
        transformStyle: 'preserve-3d',
        overflow: 'hidden'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setRotation({ x: 0, y: 0 });
      }}
    >
      {/* Clock face with 3D effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#f0f4ff] to-[#d4dcff] shadow-inner" 
        style={{ transform: 'translateZ(2px)' }}></div>
      
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full" 
        style={{ transform: 'translateZ(4px)', zIndex: 1 }}>
                
        {/* Revised clock markings circle - only show bottom half with no top border */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 rounded-b-full" 
             style={{ 
               borderLeft: '4px solid rgba(224, 229, 255, 0.3)', 
               borderRight: '4px solid rgba(224, 229, 255, 0.3)', 
               borderBottom: '4px solid rgba(224, 229, 255, 0.3)',
               marginLeft: '4px',
               marginRight: '4px',
               zIndex: 0
             }}>
          {hourMarkers}
        </div>
        
        {/* Digital time display (optional) */}
        <div className="absolute top-[60%] text-[9px] sm:text-[10px] font-medium text-[#1a237e] tracking-wider">
          {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}
        </div>
        
        {/* Center decorative rings */}
        <div className="absolute w-5 h-5 rounded-full bg-gradient-to-br from-[#e0e5ff] to-[#b9c3ff] border border-[#8c9eff] z-20"></div>
        <div className="absolute w-3 h-3 rounded-full bg-[#1a237e] z-30"></div>
        <div className="absolute w-1.5 h-1.5 rounded-full bg-white z-40"></div>
        
        {/* Hour hand */}
        <div 
          className="absolute z-10"
          style={{ 
            width: '4px',
            height: '22%', 
            bottom: '50%',
            left: 'calc(50% - 2px)',
            transform: `rotate(${hoursDegrees}deg)`,
            transformOrigin: '50% 100%',
            background: 'linear-gradient(to top, #1a237e, #3949ab)',
            borderRadius: '2px 2px 0 0',
            zIndex: 10
          }}
        ></div>
        
        {/* Minute hand */}
        <div 
          className="absolute z-15"
          style={{ 
            width: '3px',
            height: '32%',
            bottom: '50%',
            left: 'calc(50% - 1.5px)',
            transform: `rotate(${minutesDegrees}deg)`,
            transformOrigin: '50% 100%',
            background: 'linear-gradient(to top, #283593, #5c6bc0)',
            borderRadius: '1.5px 1.5px 0 0',
            zIndex: 15
          }}
        ></div>
        
        {/* Second hand */}
        <div 
          className="absolute z-20"
          style={{ 
            width: '1.5px',
            height: '36%',
            bottom: '50%',
            left: 'calc(50% - 0.75px)',
            transform: `rotate(${secondsDegrees}deg)`,
            transformOrigin: '50% 100%',
            background: '#ff5252',
            borderRadius: '1px'
          }}
        ></div>
        
        {/* Second hand back extension */}
        <div 
          className="absolute z-20"
          style={{ 
            width: '1px',
            height: '12%',
            top: '50%',
            left: 'calc(50% - 0.5px)',
            transform: `rotate(${secondsDegrees + 180}deg)`,
            transformOrigin: '50% 0%',
            background: '#ff5252',
            borderRadius: '0.5px'
          }}
        ></div>
      </div>
      
      {/* Side of the clock for 3D effect */}
      <div className="absolute inset-0 rounded-full opacity-30"
        style={{ 
          borderRadius: '50%',
          borderBottom: '8px solid #c7d0ff', 
          borderLeft: '8px solid #c7d0ff', 
          borderRight: '8px solid #c7d0ff',
          borderTop: 'none', 
          transform: 'translateZ(-2px)'
        }}
        style={{ transform: 'translateZ(-2px)' }}></div>
        
      {/* Clock shadow (cast on the page) */}
      <div className="absolute inset-0 rounded-full bg-black opacity-10 blur-md -z-10"
        style={{ transform: 'translateZ(-10px) translateY(10px) scale(0.8)' }}></div>
    </div>
  );
};

export default AnimatedClock;