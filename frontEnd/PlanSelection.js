const { useState } = React;

function PlanSelection({ onSelectPlan, userData, onLogout }) {
	return (
		<div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 to-slate-200">
			{/* Header */}
			<header
				className="px-6 py-4 flex items-center justify-between shadow-sm"
				style={{ backgroundColor: "#BE0000" }}
			>
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
						<div className="text-xl font-bold" style={{ color: "#BE0000" }}>
							U
						</div>
					</div>
					<h1 className="text-xl font-semibold text-white">Advisor Chat</h1>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-white text-sm">
						Welcome, {userData?.username}
					</span>
					<button
						type="button"
						onClick={onLogout}
						className="px-3 py-1.5 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm text-sm"
						style={{ color: "#BE0000" }}
					>
						Logout
					</button>
				</div>
			</header>

			{/* Main Content */}
			<div className="flex-1 flex flex-col items-center justify-center px-6">
				<div className="text-center mb-12">
					<h2 className="text-4xl font-bold text-slate-800 mb-3">
						Choose Your Planning Mode
					</h2>
					<p className="text-lg text-slate-600">
						Select how you'd like to plan your academic schedule
					</p>
				</div>

				<div className="flex gap-8 max-w-5xl w-full">
					{/* Single Semester Plan Button */}
					<button
						onClick={() => onSelectPlan('single')}
						className="flex-1 bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 p-10 group"
					>
						<div className="flex flex-col items-center text-center">
							<div 
								className="w-24 h-24 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"
								style={{ backgroundColor: "#BE0000" }}
							>
								<svg 
									className="w-12 h-12 text-white" 
									fill="none" 
									stroke="currentColor" 
									viewBox="0 0 24 24"
								>
									<path 
										strokeLinecap="round" 
										strokeLinejoin="round" 
										strokeWidth={2} 
										d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
									/>
								</svg>
							</div>
							<h3 className="text-2xl font-bold text-slate-800 mb-3">
								Single Semester Plan
							</h3>
							<p className="text-slate-600 mb-6">
								Plan and optimize your schedule for one semester at a time
							</p>
							<div className="flex flex-wrap gap-2 justify-center">
								<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
									Quick Setup
								</span>
								<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
									AI Advisor
								</span>
								<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
									Schedule Builder
								</span>
							</div>
						</div>
					</button>

					{/* Multi Semester Plan Button */}
					<button
						onClick={() => onSelectPlan('multi')}
						className="flex-1 bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 p-10 group"
					>
						<div className="flex flex-col items-center text-center">
							<div 
								className="w-24 h-24 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"
								style={{ backgroundColor: "#BE0000" }}
							>
								<svg 
									className="w-12 h-12 text-white" 
									fill="none" 
									stroke="currentColor" 
									viewBox="0 0 24 24"
								>
									<path 
										strokeLinecap="round" 
										strokeLinejoin="round" 
										strokeWidth={2} 
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" 
									/>
								</svg>
							</div>
							<h3 className="text-2xl font-bold text-slate-800 mb-3">
								Multi-Semester Plan
							</h3>
							<p className="text-slate-600 mb-6">
								Create a comprehensive academic plan spanning multiple semesters
							</p>
							<div className="flex flex-wrap gap-2 justify-center">
								<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
									Long-term Planning
								</span>
								<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
									Prerequisite Tracking
								</span>
								<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
									Graduation Path
								</span>
							</div>
						</div>
					</button>
				</div>

				{/* Footer Info */}
				<div className="mt-12 text-center text-slate-600">
					<p className="text-sm">
						Not sure which to choose? Start with Single Semester Plan and switch anytime.
					</p>
				</div>
			</div>

			{/* Bottom Footer */}
			<footer className="py-4 text-center text-sm text-slate-600">
				<p>© 2025 University Advisor Chat. All rights reserved.</p>
			</footer>
		</div>
	);
}