"use client"

import type React from "react"
import { createContext, useContext, useRef, useState } from "react"

const MouseEnterContext = createContext<
  | {
      isMouseEnter: boolean
      setIsMouseEnter: (value: boolean) => void
    }
  | undefined
>(undefined)

export const CardContainer = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMouseEnter, setIsMouseEnter] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const { left, top, width, height } = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - left - width / 2) / 25
    const y = (e.clientY - top - height / 2) / 25
    containerRef.current.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`
  }

  const handleMouseLeave = () => {
    if (!containerRef.current) return
    containerRef.current.style.transform = "rotateY(0deg) rotateX(0deg)"
    setIsMouseEnter(false)
  }

  const handleMouseEnter = () => {
    setIsMouseEnter(true)
  }

  return (
    <MouseEnterContext.Provider value={{ isMouseEnter, setIsMouseEnter }}>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={className}
        style={{
          perspective: "1000px",
          transformStyle: "preserve-3d",
          transition: "transform 0.1s ease-out",
        }}
      >
        {children}
      </div>
    </MouseEnterContext.Provider>
  )
}

export const CardBody = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div
      className={className}
      style={{
        transformStyle: "preserve-3d",
      }}
    >
      {children}
    </div>
  )
}

export const CardItem = ({
  as: Component = "div",
  children,
  className,
  translateZ = 0,
  ...props
}: {
  as?: React.ElementType
  children: React.ReactNode
  className?: string
  translateZ?: number
  [key: string]: any
}) => {
  const { isMouseEnter } = useContext(MouseEnterContext) || { isMouseEnter: false }

  return (
    <Component
      className={className}
      style={{
        transformStyle: "preserve-3d",
        transform: isMouseEnter ? `translateZ(${translateZ}px)` : "translateZ(0px)",
        transition: "transform 0.1s ease-out",
      }}
      {...props}
    >
      {children}
    </Component>
  )
}
