const { useState, useRef, useEffect } = React;

// DeepSeek-R1 (Ollama /v1 path) ---
const BASE_URL = "https://unjudicial-sherilyn-ruly.ngrok-free.dev/ollama"; // FastAPI, not Ollama
// URL may change depending when we migrate out of ngrok
// const API_KEY = "local"; // not needed for FastAPI unless you want it

async function sendMessageLLM(userText, onToken) {
	const res = await fetch(`${BASE_URL}/chat`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// no Authorization header needed for the tiny FastAPI example
		},
		body: JSON.stringify({ message: userText }),
	});

	if (!res.ok) {
		throw new Error(`LLM request failed: ${res.status}`);
	}

	// FastAPI returns a normal JSON body, not a stream
	const data = await res.json();
	// { reply: "full answer text" }
	onToken(data.reply); // call your appendToken once with the whole reply
}

function ChatUI() {
	const [messages, setMessages] = useState([
		{ role: "assistant", content: "Hello! How can I help you today?" },
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState([]);
	const [visualizationData, setVisualizationData] = useState(null);
	const [isRightPanelExpanded, setIsRightPanelExpanded] = useState(false);
	const messagesEndRef = useRef(null);
	const textareaRef = useRef(null);
	const fileInputRef = useRef(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height =
				Math.min(textareaRef.current.scrollHeight, 200) + "px";
		}
	}, [input]);

	const handleFileUpload = (e) => {
		const files = Array.from(e.target.files);
		if (files.length > 0) {
			const newFiles = files.map((file) => ({
				name: file.name,
				size: (file.size / 1024).toFixed(2) + " KB",
				type: file.type,
			}));
			setUploadedFiles((prev) => [...prev, ...newFiles]);

			// Simulate generating a visualization after file upload
			setTimeout(() => {
				setVisualizationData({
					type: "schedule",
					data: generateSampleSchedule(),
				});
			}, 1000);
		}
	};

	//we can make this dynamically created aswell as the class day and start times.
	const generateSampleSchedule = () => {
		return [
			{
				day: "Monday",
				startTime: "9:00 AM",
				endTime: "10:30 AM",
				class: "Mathematics",
				room: "Room 101",
			},
			{
				day: "Monday",
				startTime: "11:00 AM",
				endTime: "12:30 PM",
				class: "Physics",
				room: "Lab 203",
			},
			{
				day: "Tuesday",
				startTime: "10:00 AM",
				endTime: "11:30 AM",
				class: "Chemistry",
				room: "Lab 105",
			},
			{
				day: "Tuesday",
				startTime: "2:00 PM",
				endTime: "3:30 PM",
				class: "English",
				room: "Room 304",
			},
			{
				day: "Wednesday",
				startTime: "9:00 AM",
				endTime: "10:30 AM",
				class: "History",
				room: "Room 201",
			},
			{
				day: "Thursday",
				startTime: "1:00 PM",
				endTime: "2:30 PM",
				class: "Biology",
				room: "Lab 108",
			},
			{
				day: "Friday",
				startTime: "10:00 AM",
				endTime: "11:30 AM",
				class: "Computer Science",
				room: "Lab 401",
			},
		];
	};

	const handleSubmit = async () => {
		if (!input.trim() || isLoading) return;

		const userMessage = input.trim();
		setInput("");
		setIsLoading(true);

		// push user, then an empty assistant placeholder to stream into
		setMessages((prev) => [
			...prev,
			{ role: "user", content: userMessage },
			{ role: "assistant", content: "" },
		]);

		const appendToken = (t) => {
			setMessages((prev) => {
				const copy = [...prev];
				const last = copy[copy.length - 1];
				copy[copy.length - 1] = { ...last, content: last.content + t };
				return copy;
			});
		};

		try {
			await sendMessageLLM(userMessage, appendToken);
		} catch (err) {
			// show an error bubble if the request fails
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: `⚠️ ${err.message}` },
			]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const removeFile = (index) => {
		setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const toggleRightPanel = () => {
		setIsRightPanelExpanded(!isRightPanelExpanded);
	};

	return (
		<div className="flex h-screen bg-slate-100 relative">
			{/* Left Side - Chat Interface */}
			<div
				className={`flex flex-col border-r border-slate-300 bg-white transition-all duration-500 ease-in-out overflow-hidden ${
					isRightPanelExpanded ? "w-0" : "w-1/2"
				}`}
			>
				{/* Header */}
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-semibold text-white">Advisor Chat</h1>
					</div>
				</header>

				{/* Messages Container */}
				<div className="flex-1 overflow-y-auto">
					<div className="px-4 py-4 space-y-3">
						{messages.map((message, index) => (
							<div
								key={index}
								className={`flex gap-2 ${
									message.role === "user" ? "justify-end" : "justify-start"
								}`}
							>
								{message.role === "assistant" && (
									<div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 flex items-center justify-center shadow-sm text-white text-xs font-bold">
										AI
									</div>
								)}

								<div
									className={`max-w-md rounded-xl px-3 py-2 shadow-sm text-sm ${
										message.role === "user"
											? "text-white"
											: "bg-slate-50 text-slate-800 border border-slate-200"
									}`}
									style={
										message.role === "user"
											? { backgroundColor: "#BE0000" }
											: {}
									}
								>
									<p className="whitespace-pre-wrap leading-snug">
										{message.content}
									</p>
								</div>

								{message.role === "user" && (
									<div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shadow-sm text-white text-sm">
										👤
									</div>
								)}
							</div>
						))}

						{isLoading && (
							<div className="flex gap-2 justify-start">
								<div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-700 flex items-center justify-center shadow-sm text-white text-xs font-bold">
									AI
								</div>
								<div className="bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
									<div className="flex gap-1">
										<div
											className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
											style={{ animationDelay: "0ms" }}
										></div>
										<div
											className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
											style={{ animationDelay: "150ms" }}
										></div>
										<div
											className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
											style={{ animationDelay: "300ms" }}
										></div>
									</div>
								</div>
							</div>
						)}

						<div ref={messagesEndRef} />
					</div>
				</div>

				{/* Input Area */}
				<div className="border-t border-slate-200 px-6 py-4 bg-white">
					<div>
						<div
							className="relative flex items-center gap-3 bg-slate-50 rounded-full border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-opacity-50 transition-all"
							style={{
								focusWithinBorderColor: "#BE0000",
								focusWithinRingColor: "#BE0000",
							}}
						>
							<button
								onClick={() => fileInputRef.current?.click()}
								className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-all text-sm font-bold"
								title="Upload file"
							>
								+
							</button>
							<input
								ref={fileInputRef}
								type="file"
								onChange={handleFileUpload}
								className="hidden"
								multiple
								accept=".txt,.pdf,.doc,.docx,.csv"
							/>
							<input
								type="text"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Type your message here..."
								className="flex-1 bg-transparent px-2 py-1 outline-none text-slate-800 placeholder-slate-400"
								disabled={isLoading}
							/>
							<button
								onClick={handleSubmit}
								disabled={!input.trim() || isLoading}
								className="flex-shrink-0 w-8 h-8 rounded-full text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-lg"
								style={{ backgroundColor: "#BE0000" }}
							>
								➤
							</button>
						</div>

						{/* Uploaded Files Display - Below chat bar */}
						{uploadedFiles.length > 0 && (
							<div className="mt-2 flex gap-2 overflow-x-auto">
								{uploadedFiles.map((file, index) => (
									<div
										key={index}
										className="flex-shrink-0 flex items-center gap-1 bg-slate-100 rounded px-2 py-1 border border-slate-200"
									>
										<span style={{ fontSize: "10px" }}>📄</span>
										<span className="text-xs text-slate-700 max-w-32 truncate">
											{file.name}
										</span>
										<button
											onClick={() => removeFile(index)}
											className="text-slate-400 hover:text-red-500 text-xs ml-0.5"
										>
											×
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Right Side - Visualizations & File Management */}
			<div
				className={`flex flex-col bg-slate-50 transition-all duration-500 ease-in-out ${
					isRightPanelExpanded ? "w-full" : "w-1/2"
				}`}
			>
				{/* Right Panel Header */}
				<header
					className="border-b border-slate-200 px-6 py-4 h-16 flex items-center justify-between shadow-sm"
					style={{ backgroundColor: "#BE0000" }}
				>
					<h2 className="text-xl font-semibold text-white">View</h2>
					<div className="flex items-center gap-3">
						<button
							onClick={() => {
								// Add your logout logic here
								console.log("Logout clicked");
								// Example: window.location.href = '/login';
							}}
							className="px-2 py-1 bg-white font-medium rounded hover:bg-slate-100 transition-all shadow-sm"
							style={{ color: "#BE0000", fontSize: "10px" }}
						>
							Logout
						</button>
						<div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
							<div className="text-xl font-bold" style={{ color: "#BE0000" }}>
								U
							</div>
						</div>
					</div>
				</header>

				{/* Content Area */}
				<div className="flex-1 overflow-y-auto p-6 space-y-6">
					{/* Visualization Section */}
					{visualizationData && (
						<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
							<h3 className="text-base font-semibold text-slate-800 mb-3">
								Weekly Class Schedule
							</h3>

							{/* Calendar Grid */}
							<div className="w-full">
								{/* Header with days */}
								<div className="grid grid-cols-6 gap-1 mb-1">
									<div className="text-xs font-semibold text-slate-600 text-center py-1">
										Time
									</div>
									{["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
										<div
											key={day}
											className="text-xs font-semibold text-slate-600 text-center py-1"
										>
											{day}
										</div>
									))}
								</div>

								{/* Time slots with positioning */}
								<div className="relative">
									{/* Background grid */}
									<div className="space-y-0.5">
										{[
											"8AM",
											"9AM",
											"10AM",
											"11AM",
											"12PM",
											"1PM",
											"2PM",
											"3PM",
											"4PM",
											"5PM",
										].map((time) => (
											<div key={time} className="grid grid-cols-6 gap-1">
												<div className="text-xs text-slate-500 py-1 text-right pr-1 h-10">
													{time}
												</div>
												{[
													"Monday",
													"Tuesday",
													"Wednesday",
													"Thursday",
													"Friday",
												].map((day) => (
													<div
														key={`${day}-${time}`}
														className="h-10 border border-slate-100 rounded bg-slate-50"
													></div>
												))}
											</div>
										))}
									</div>

									{/* Absolute positioned classes */}
									<div className="absolute inset-0 pointer-events-none">
										<div className="grid grid-cols-6 gap-1 h-full">
											<div></div>
											{[
												"Monday",
												"Tuesday",
												"Wednesday",
												"Thursday",
												"Friday",
											].map((day) => (
												<div key={day} className="relative">
													{visualizationData.data
														.filter((item) => item.day === day)
														.map((classItem, idx) => {
															// Parse start time
															const startMatch =
																classItem.startTime.match(
																	/(\d+):(\d+)\s*(AM|PM)/
																);
															let startHour = parseInt(startMatch[1]);
															const startMin = parseInt(startMatch[2]);
															const startPeriod = startMatch[3];
															if (startPeriod === "PM" && startHour !== 12)
																startHour += 12;
															if (startPeriod === "AM" && startHour === 12)
																startHour = 0;

															// Parse end time
															const endMatch =
																classItem.endTime.match(
																	/(\d+):(\d+)\s*(AM|PM)/
																);
															let endHour = parseInt(endMatch[1]);
															const endMin = parseInt(endMatch[2]);
															const endPeriod = endMatch[3];
															if (endPeriod === "PM" && endHour !== 12)
																endHour += 12;
															if (endPeriod === "AM" && endHour === 12)
																endHour = 0;

															// Calculate position and height (each hour = 40px + 2px gap)
															const startOffset =
																(startHour - 8) * 42 +
																(startMin / 60) * 42;
															const duration =
																endHour -
																startHour +
																(endMin - startMin) / 60;
															const height = duration * 42 - 2;

															return (
																<div
																	key={idx}
																	className="absolute rounded px-1.5 py-1 text-white pointer-events-auto"
																	style={{
																		backgroundColor: "#BE0000",
																		top: `${startOffset}px`,
																		height: `${height}px`,
																		left: 0,
																		right: 0,
																	}}
																>
																	<div
																		className="font-semibold truncate"
																		style={{ fontSize: "10px" }}
																	>
																		{classItem.class}
																	</div>
																	<div
																		className="truncate"
																		style={{
																			fontSize: "9px",
																			opacity: 0.9,
																		}}
																	>
																		{classItem.room}
																	</div>
																	<div
																		className="truncate"
																		style={{
																			fontSize: "8px",
																			opacity: 0.8,
																		}}
																	>
																		{classItem.startTime}-
																		{classItem.endTime}
																	</div>
																</div>
															);
														})}
												</div>
											))}
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Empty State for Visualizations */}
					{!visualizationData && (
						<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
							<h3 className="text-lg font-semibold text-slate-800 mb-4">
								Visualizations
							</h3>
							<div className="text-center py-12 text-slate-500">
								<p className="text-4xl mb-2">📊</p>
								<p>No visualizations yet</p>
								<p className="text-sm mt-1">
									Upload a transcript to generate a schedule
								</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Expand/Collapse Button */}
			<button
				onClick={toggleRightPanel}
				className="absolute top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-full bg-white shadow-md border flex items-center justify-center hover:bg-slate-50 z-10"
				style={{
					left: isRightPanelExpanded ? "10px" : "calc(50% - 12px)",
					borderColor: "#BE0000",
					transition: "left 0.5s ease-in-out",
				}}
				title={isRightPanelExpanded ? "Show chat" : "Expand panel"}
			>
				{isRightPanelExpanded ? (
					<span className="text-xs font-bold" style={{ color: "#BE0000" }}>
						×
					</span>
				) : (
					<div
						className="w-2 h-2 rounded-full"
						style={{ backgroundColor: "#BE0000" }}
					></div>
				)}
			</button>
		</div>
	);
}
