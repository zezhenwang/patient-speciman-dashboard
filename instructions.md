Broadly, physicians in the hospital order tests for inpatients; specimens are collected; the collected specimens are transported to the laboratory; the laboratory analyzes the specimens; results are verified and provided to the physician via our Enterprise Health Record system.
 
Clearly, this is time series information.  Many events happen in this “specimen journey”, including defects (issues with specimen handling, specimen collection quality, orders being cancelled, orders that have potentially no clinical value, etc).
 
I would like to provide you and the students with an extract with many representative events that can be associated to numerous dimensions (ordering inpatient ward, patient stay, ordered test, specimen collector, fulfilling laboratory, etc).
 
We would find great value in a visualization that allowed us to do the following:

+ Visualize (visual, inspectable, graphic timelines) the “average” time series of events for laboratory orders, given a set of dimensional filters (such as “all CBCs ordered in ward CW1”).  Method is open to interpretation, and whichever means the students find most readily available.
+ An A/B version of the above visualization to compare two mutually exclusive datasets (such as “All CBCs ordered in ward CW1, tests ordered on weekdays vs tests ordered on weekends”).
+ Some way to visualize the likelihood of a named time series event, such as “specimen cancelled due to hemolysis”, in that A/B comparison.
