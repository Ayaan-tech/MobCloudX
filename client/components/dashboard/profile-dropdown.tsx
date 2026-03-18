"use client"
import { useState, useRef, useEffect } from "react"
import { LogOut, Settings, User, ChevronDown } from "lucide-react"
import { useClerk, useUser } from "@clerk/nextjs"


interface ProfileDropdownProps {
  onLogout: () => void
}



export default function ProfileDropdown({onLogout}: ProfileDropdownProps){
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { user } = useUser()
    const { signOut } = useClerk()
    const userInitials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U" : "JD"
    const userName = user ? `${user.firstName} ${user.lastName}`.trim() || "User" : "John Doe"
    const userEmail = user?.emailAddresses[0]?.emailAddress || "john@example.com"
    const toggleDropdown = () => setIsOpen(!isOpen)
    useEffect(() =>{
        function handleClickOutside(event: MouseEvent){
            if (dropdownRef.current && !dropdownRef.current.contains(event.target )){
                setIsOpen(false)
            }

        }
        document.addEventListener("mousedown", handleClickOutside)
        return () =>document.removeEventListener("mousedown", handleClickOutside)
    },[])

    const handleLogout = async() =>{
        setIsOpen(false)
        await signOut()
        onLogout()
    }
      return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 hover:bg-indigo-800 rounded-lg transition"
      >
        <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-sm font-semibold">
          {userInitials}
        </div>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-indigo-900 border border-indigo-800 rounded-lg shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-indigo-800">
            <p className="text-sm font-semibold text-white">{userName}</p>
            <p className="text-xs text-indigo-400">{userEmail}</p>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button className="w-full px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-800 flex items-center space-x-2 transition">
              <User className="w-4 h-4" />
              <span>Profile</span>
            </button>
            <button className="w-full px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-800 flex items-center space-x-2 transition">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-indigo-800 py-2">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-sm text-red-400 hover:bg-indigo-800 flex items-center space-x-2 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}