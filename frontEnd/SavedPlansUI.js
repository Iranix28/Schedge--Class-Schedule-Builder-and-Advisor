const { useState } = React;

function SavedPlansUI({ userData, onLogout, onBack, onSelectPlan }) {
	const [savedPlans] = useState([
		{ id: 1, title: "Fall 2025 Schedule Planning", date: "2025-01-15", courses: 5, semester: "Fall 2025" },
		{ id: 2, title: "CS Major 4-Year Plan", date: "2025-01-10", courses: 32, semester: "Multi-Semester" },
		{ id: 3, title: "Spring 2026 Course Selection", date: "2025-01-05", courses: 6, semester: "Spring 2026" },
		{ id: 4, title: "Elective Planning", date: "2024-12-20", courses: 4, semester: "Fall 2025" },
	]);

	const [searchQuery, setSearchQuery] = useState("");

	const filteredPlans = savedPlans.filter(plan => 
		plan.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
		plan.semester.toLowerCase().includes(searchQuery.toLowerCase())
	);

	return (
		<div className="flex flex-col h-screen bg-slate-100">
			{/* Header */}
			<header
				className="px-6 py-4 flex items-center justify-between shadow-sm"
				style={{ backgroundColor: "#BE0000" }}
			>
				<div className="flex items-center gap-3">
					{onBack && (
						<button
							type="button"
							onClick={onBack}
							className="mr-2 w-10 h-10 rounded-full bg-white text-red-700 flex items-center justify-center hover:bg-slate-100 transition-all"
							title="Go back"
						>
							<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
							</svg>
						</button>
					)}
					<div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
						<div className="text-xl font-bold" style={{ color: "#BE0000" }}>
							U
						</div>
					</div>
					<h1 className="text-xl font-semibold text-white">Saved Plans</h1>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-white text-sm">
						{userData?.username}
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
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto">
					{/* Search Bar */}
					<div className="mb-6">
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search plans..."
							className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
						/>
					</div>

					{/* Plan List */}
					<div className="space-y-4">
						{filteredPlans.length === 0 ? (
							<div className="text-center py-12">
								<p className="text-slate-500">No plans found</p>
							</div>
						) : (
							filteredPlans.map((plan) => (
								<div
									key={plan.id}
									onClick={() => onSelectPlan(plan)}
									className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group p-6 border-2 border-transparent hover:border-red-700"
								>
									<div className="flex justify-between items-start mb-3">
										<div className="flex-1">
											<h3 className="text-xl font-bold text-slate-800 group-hover:text-red-700 transition-colors mb-1">
												{plan.title}
											</h3>
											<div className="flex items-center gap-4 text-sm text-slate-600">
												<span className="flex items-center gap-1">
													<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
													</svg>
													{plan.date}
												</span>
												<span className="flex items-center gap-1">
													<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
													</svg>
													{plan.courses} courses
												</span>
											</div>
										</div>
										<span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium">
											{plan.semester}
										</span>
									</div>
									<div className="flex items-center justify-end gap-2 text-sm font-medium" style={{ color: "#BE0000" }}>
										<span>Open Plan</span>
										<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
										</svg>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	);
}